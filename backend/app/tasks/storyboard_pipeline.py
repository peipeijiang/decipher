"""Background pipeline for storyboard replication."""
import asyncio
import base64
import concurrent.futures
import json
import logging
import traceback
from pathlib import Path
from typing import List, Optional

from PIL import Image

from app.database import SessionLocal
from app.models.storyboard_replication import StoryboardReplication
from app.models.video import Video
from app.utils.scene_detector import smart_extract_keyframes
from app.services.storyboard_service import stitch_storyboard, split_storyboard

logger = logging.getLogger(__name__)

# Maximum concurrent per-frame replacement calls (1 = serial to avoid rate limits)
_MAX_FRAME_CONCURRENCY = 1
# Delay between per-frame API calls (seconds) to avoid rate limiting
_FRAME_DELAY_SECONDS = 3


def extract_keyframes_pipeline(replication_id: str):
    """
    后台任务：提取关键帧并拼接

    Args:
        replication_id: StoryboardReplication ID
    """
    db = SessionLocal()
    try:
        replication = db.get(StoryboardReplication, replication_id)
        if not replication:
            logger.error("Replication not found: %s", replication_id)
            return

        video = db.get(Video, replication.video_id)
        if not video:
            logger.error("Video not found: %s", replication.video_id)
            replication.status = "failed"
            replication.error = "Video not found"
            db.commit()
            return

        logger.info("Starting keyframe extraction for replication: %s", replication_id)

        replication.status = "extracting"
        db.commit()

        # 改进3: 查询关联的 Report，将 shots 数据传给 AI 选帧
        report_shots: Optional[str] = None
        try:
            from app.models.report import Report
            report = db.query(Report).filter(Report.video_id == str(video.id)).first()
            if report and report.shots:
                report_shots = report.shots
                logger.info("Found report shots for guided keyframe selection, replication: %s", replication_id)
        except Exception as e:
            logger.warning("Failed to fetch report shots: %s", e)

        # Step 1: 智能提取关键帧（带分镜分析引导）
        frames, timestamps = smart_extract_keyframes(
            video.filepath,
            target_duration=15.0,
            report_shots=report_shots,
        )
        logger.info("Extracted %d keyframes", len(frames))

        # Step 2: 保存关键帧到磁盘
        frame_dir = Path("data/storyboards") / replication_id / "frames"
        frame_dir.mkdir(parents=True, exist_ok=True)

        frame_paths = []
        for idx, frame_data in enumerate(frames):
            frame_img = Image.fromarray(frame_data['image'])
            frame_path = frame_dir / f"frame_{idx}.jpg"
            frame_img.save(frame_path, quality=90)
            frame_paths.append(str(frame_path))

        logger.info("Saved %d frames to disk", len(frame_paths))

        # Step 3: 拼接分镜图
        storyboard_image, layout = stitch_storyboard(frames, target_size=(1920, 1080))

        storyboard_path = Path("data/storyboards") / replication_id / "storyboard.jpg"
        storyboard_path.parent.mkdir(parents=True, exist_ok=True)
        storyboard_image.save(storyboard_path, quality=90)

        logger.info("Saved storyboard image: %s", storyboard_path)

        # Step 4: 更新数据库（含 frame_metadata）
        frame_metadata = [f.get("metadata", {}) for f in frames]

        replication.frame_count = len(frames)
        replication.frame_timestamps = json.dumps([
            {"time": f["time"], "index": i} for i, f in enumerate(frames)
        ])
        replication.frame_paths = json.dumps(frame_paths)
        replication.storyboard_image_path = str(storyboard_path)
        replication.layout_grid = layout
        replication.frame_metadata = json.dumps(frame_metadata)
        replication.status = "ready"
        db.commit()

        logger.info("Keyframe extraction completed for replication: %s", replication_id)

    except Exception as e:
        logger.error("Pipeline failed for replication %s: %s", replication_id, e)
        logger.error(traceback.format_exc())

        try:
            replication = db.get(StoryboardReplication, replication_id)
            if replication:
                replication.status = "failed"
                replication.error = str(e)[:500]
                db.commit()
        except Exception as commit_error:
            logger.error("Failed to update error status: %s", commit_error)

    finally:
        db.close()


def _analyze_frame_context(
    frame_img: "Image.Image",
    frame_index: int,
    metadata: dict,
    vision_model,
) -> str:
    """
    用视觉模型精确分析单帧，获取产品在场景中的具体动作和上下文。

    返回一段精确的场景描述，如：
    "A white pet nail clipper is being used to trim a puppy's front paw nails.
     A woman's left hand holds the clipper at a 45-degree angle while the puppy
     lies on a spotted blanket."

    失败时返回空字符串，调用方应 fallback 到 metadata.scene_description。

    Args:
        frame_img: PIL Image 对象
        frame_index: 帧编号（0-based），仅用于日志
        metadata: 该帧的预生成元数据（用于构造分析 prompt 的提示）
        vision_model: 已初始化的 AIModel 实例（需支持 analyze_image）

    Returns:
        精确的场景描述字符串，失败时返回 ""
    """
    import tempfile
    import os

    scene_hint = metadata.get("scene_description", "")
    hint_clause = f" The pre-analyzed scene description is: '{scene_hint}'." if scene_hint else ""

    analysis_prompt = (
        "Describe exactly what is happening in this image, focusing on the product/tool."
        f"{hint_clause}"
        " Answer these questions in 2-3 sentences:"
        " (1) What specific product or tool is visible?"
        " (2) What exact action is being performed with it — be precise"
        " (e.g., 'trimming a puppy\\'s rear left paw nails', not just 'using a nail clipper')?"
        " (3) Who or what is interacting with the product (human hand, no hand, animal, etc.)?"
        " Be specific and factual. Do not speculate. Output plain text only."
    )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            frame_img.save(tmp, format="JPEG", quality=85)
            tmp_path = tmp.name

        result = vision_model.analyze_image(tmp_path, analysis_prompt, max_tokens=200)
        result = result.strip()
        if result:
            logger.info("Frame %d context analysis: %s", frame_index + 1, result[:120])
        return result
    except Exception as e:
        logger.warning("Frame %d context analysis failed: %s", frame_index + 1, e)
        return ""
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _build_frame_prompt(
    frame_index: int,
    total_frames: int,
    metadata: dict,
    product_description: str,
    scene_context: str = "",
) -> str:
    """
    根据帧元数据和精确场景描述构建单帧替换 prompt。

    Args:
        frame_index: 帧编号（0-based）
        total_frames: 总帧数
        metadata: 该帧的元数据 dict
        product_description: 产品描述
        scene_context: 视觉模型分析得到的精确场景描述（优先级高于 metadata）

    Returns:
        prompt 字符串
    """
    shot_type = metadata.get("shot_type", "medium")
    story_beat = metadata.get("story_beat", "feature-demo")
    product_pos = metadata.get("product_position", "center")

    shot_abbrev = {
        "close-up": "CU",
        "medium": "MS",
        "wide": "WS",
    }.get(shot_type, shot_type.upper()[:2])

    # 优先使用视觉分析得到的精确描述，fallback 到 metadata
    effective_scene = scene_context or metadata.get("scene_description", "")

    frame_label = f"Frame {frame_index + 1} of {total_frames}"

    prompt = (
        f"This is {frame_label} from a {total_frames}-frame product marketing storyboard. "
        f"Story beat: {story_beat}. Shot type: {shot_type} ({shot_abbrev}). "
        f"Product position: {product_pos}. "
    )

    if effective_scene:
        prompt += (
            f"CURRENT SCENE: {effective_scene} "
            f"The product in this scene is performing a specific action — "
            f"the replacement product MUST perform THE EXACT SAME ACTION in the EXACT SAME WAY. "
        )

    prompt += (
        "The second reference image shows the EXACT product to place in this frame. "
        "Replace ONLY the product/tool with this EXACT product — preserve its EXACT shape, color, "
        "material, texture, size, and all visual details with 100% fidelity. "
        "Do NOT alter, stylize, or reimagine the product. "
        "The new product must be doing the same thing as the original product: "
        "same subject, same pose, same action, same scene. "
        "Keep the background, hands, animals, camera angle, lighting, shadows, "
        "and overall composition IDENTICAL. "
        "ONLY the product object changes — everything else stays exactly the same."
    )
    if product_description:
        prompt += f" New product reference: {product_description}."

    return prompt


def _replace_single_frame_aliyun(
    frame_img: Image.Image,
    product_path: str,
    prompt: str,
    aliyun_key: str,
) -> Optional[Image.Image]:
    """Call Aliyun qwen-image-2.0-pro to replace product in a single frame."""
    import base64 as _base64
    import io
    import mimetypes
    import requests as _requests
    from dashscope import MultiModalConversation
    import dashscope

    dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

    # Encode frame as base64 JPEG
    buf = io.BytesIO()
    frame_img.save(buf, format='JPEG', quality=90)
    frame_b64 = "data:image/jpeg;base64," + _base64.b64encode(buf.getvalue()).decode()

    # Encode product image
    with open(product_path, 'rb') as f:
        product_bytes = f.read()
    mime, _ = mimetypes.guess_type(product_path)
    mime = mime or 'image/jpeg'
    product_b64 = f"data:{mime};base64," + _base64.b64encode(product_bytes).decode()

    # Pick size closest to the frame's aspect ratio
    ratio = frame_img.width / frame_img.height
    if ratio > 1.2:
        size = "1792*1024"
    elif ratio < 0.8:
        size = "1024*1792"
    else:
        size = "1024*1024"

    messages = [
        {
            'role': 'user',
            'content': [
                {'image': frame_b64},
                {'image': product_b64},
                {'text': prompt},
            ],
        }
    ]

    response = MultiModalConversation.call(
        api_key=aliyun_key,
        model='qwen-image-2.0-pro',
        messages=messages,
        stream=False,
        n=1,
        size=size,
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"Aliyun frame replacement failed: {response.code} - {response.message}"
        )

    image_url = None
    for content in response.output.choices[0].message.content:
        if 'image' in content:
            image_url = content['image']
            break

    if not image_url:
        raise RuntimeError("Aliyun returned no image for frame")

    img_resp = _requests.get(image_url, timeout=60)
    img_resp.raise_for_status()
    return Image.open(io.BytesIO(img_resp.content)).convert("RGB")


def _replace_single_frame_laozhang(
    frame_img: Image.Image,
    product_path: str,
    prompt: str,
    api_key: str,
    base_url: str,
) -> Optional[Image.Image]:
    """Call laozhang gpt-image-1 to replace product in a single frame."""
    import base64 as _base64
    import io
    from app.services.image_generator import ImageGeneratorService

    service = ImageGeneratorService(api_key=api_key, base_url=base_url)

    # Save frame to a temp file for the service
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        frame_img.save(tmp, format='JPEG', quality=90)
        frame_tmp_path = tmp.name

    import os
    try:
        ratio = frame_img.width / frame_img.height
        if ratio > 1.2:
            aspect = "16:9"
        elif ratio < 0.8:
            aspect = "9:16"
        else:
            aspect = "1:1"

        result = service.generate_image_with_reference(
            prompt=prompt,
            reference_image_path=frame_tmp_path,
            additional_references=[product_path],
            model="gpt-image-1",
            aspect_ratio=aspect,
        )
    finally:
        os.unlink(frame_tmp_path)

    image_url = result.get("image_url") or result.get("url") or ""
    if image_url:
        import requests as _requests
        img_resp = _requests.get(image_url, timeout=60)
        img_resp.raise_for_status()
        return Image.open(io.BytesIO(img_resp.content)).convert("RGB")
    elif result.get("b64_json"):
        img_data = _base64.b64decode(result["b64_json"])
        return Image.open(io.BytesIO(img_data)).convert("RGB")
    else:
        raise RuntimeError(f"Laozhang returned no usable output: {result}")


def replace_product_in_storyboard(
    storyboard_path: str,
    product_path: str,
    product_description: str,
    replication_id: str,
    db,
    image_model_override: str = None,
    frame_metadata: Optional[List[dict]] = None,
) -> str:
    """
    改进4: 逐帧替换产品，替换完成后重新拼回4x4。

    当 frame_metadata 不为空时启用逐帧模式；否则 fallback 到整图替换。

    Args:
        storyboard_path: 原始分镜拼接图路径。
        product_path: 用户上传的产品图路径。
        product_description: 产品文字描述。
        replication_id: StoryboardReplication ID，用于确定输出目录。
        db: SQLAlchemy Session，用于读取 ModelConfig。
        image_model_override: 覆盖配置中的模型选择（可选）。
        frame_metadata: 每帧元数据列表（改进1生成），None 时退回整图替换。

    Returns:
        替换后图片的保存路径。
    """
    from app.models.config import ModelConfig
    from app.config import settings

    cfg = db.query(ModelConfig).first()
    providers = cfg.get_providers() if cfg else {}
    image_model = image_model_override or (cfg.image_model if cfg else "laozhang-image-2-vip")

    orig_img = Image.open(storyboard_path)
    orig_ratio = orig_img.width / orig_img.height

    output_dir = Path("data/storyboards") / replication_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(output_dir / "replaced_storyboard.jpg")

    # --- Per-frame replacement when metadata is available ---
    if frame_metadata:
        logger.info(
            "Starting per-frame replacement for replication %s (%d frames)",
            replication_id, len(frame_metadata),
        )
        frame_imgs = split_storyboard(storyboard_path, layout="4x4")
        total = len(frame_imgs)
        replaced_frames: List[Image.Image] = [None] * total

        # --- 逐帧视觉分析：替换前精确理解每帧的产品动作 ---
        scene_contexts: List[str] = [""] * total
        try:
            from app.ai_models import get_model as _get_model
            vision_model = _get_model(cfg.vision_model, cfg) if cfg else None
            if vision_model:
                logger.info(
                    "Analyzing %d frames for precise scene context (replication %s)",
                    total, replication_id,
                )
                for _i, _frame_img in enumerate(frame_imgs):
                    _meta = frame_metadata[_i] if _i < len(frame_metadata) else {}
                    _ctx = _analyze_frame_context(_frame_img, _i, _meta, vision_model)
                    scene_contexts[_i] = _ctx
                logger.info("Frame context analysis complete for replication %s", replication_id)
            else:
                logger.warning("No vision model configured; skipping frame context analysis")
        except Exception as _e:
            logger.warning(
                "Frame context analysis skipped for replication %s: %s",
                replication_id, _e,
            )

        if image_model == "qwen-image-2.0-pro":
            aliyun_key = providers.get('_aliyun_api_key') or providers.get('aliyun', {}).get('api_key', '')
            if not aliyun_key:
                raise RuntimeError("Aliyun API key not configured")

            def _process_aliyun(args):
                i, frame_img, meta = args
                import time
                if i > 0:
                    time.sleep(_FRAME_DELAY_SECONDS)
                prompt = _build_frame_prompt(
                    i, total, meta, product_description,
                    scene_context=scene_contexts[i],
                )
                try:
                    result = _replace_single_frame_aliyun(frame_img, product_path, prompt, aliyun_key)
                    logger.info("Replaced frame %d/%d (aliyun)", i + 1, total)
                    return i, result
                except Exception as e:
                    logger.warning("Frame %d replacement failed (aliyun), using original: %s", i + 1, e)
                    return i, frame_img

            tasks = [
                (i, frame_imgs[i], frame_metadata[i] if i < len(frame_metadata) else {})
                for i in range(total)
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=_MAX_FRAME_CONCURRENCY) as pool:
                for idx, result_img in pool.map(_process_aliyun, tasks):
                    replaced_frames[idx] = result_img

        else:
            laozhang_key = (
                providers.get("_laozhang_api_key")
                or getattr(settings, "laozhang_api_key", "")
            )
            laozhang_base_url = "https://api.laozhang.ai/v1"
            if not laozhang_key:
                raise RuntimeError("Laozhang API key not configured")

            def _process_laozhang(args):
                i, frame_img, meta = args
                import time
                if i > 0:
                    time.sleep(_FRAME_DELAY_SECONDS)
                prompt = _build_frame_prompt(
                    i, total, meta, product_description,
                    scene_context=scene_contexts[i],
                )
                try:
                    result = _replace_single_frame_laozhang(
                        frame_img, product_path, prompt, laozhang_key, laozhang_base_url
                    )
                    logger.info("Replaced frame %d/%d (laozhang)", i + 1, total)
                    return i, result
                except Exception as e:
                    logger.warning("Frame %d replacement failed (laozhang), using original: %s", i + 1, e)
                    return i, frame_img

            tasks = [
                (i, frame_imgs[i], frame_metadata[i] if i < len(frame_metadata) else {})
                for i in range(total)
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=_MAX_FRAME_CONCURRENCY) as pool:
                for idx, result_img in pool.map(_process_laozhang, tasks):
                    replaced_frames[idx] = result_img

        # Resize each replaced frame back to the original cell size for consistent stitching
        cell_w = orig_img.width // 4
        cell_h = orig_img.height // 4
        normalised = [
            f.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
            if f.size != (cell_w, cell_h) else f
            for f in replaced_frames
        ]

        result_canvas, _ = stitch_storyboard(normalised)
        result_canvas.save(output_path, quality=90)
        logger.info("Saved per-frame replaced storyboard: %s", output_path)
        return output_path

    # --- Fallback: 方案3 — 根据分镜描述+产品图重新生成4x4分镜图 ---
    logger.info(
        "Using regeneration mode (plan 3) for replication %s",
        replication_id,
    )

    # 获取帧时间戳用于构造分镜描述
    frame_timestamps_data = []
    try:
        import json as _json
        from app.models.storyboard_replication import StoryboardReplication as _SR
        _rep = db.get(_SR, replication_id)
        if _rep and _rep.frame_timestamps:
            frame_timestamps_data = _json.loads(_rep.frame_timestamps)
    except Exception:
        pass

    _regenerate_storyboard_from_scratch(
        product_path=product_path,
        product_description=product_description,
        output_path=output_path,
        image_model=image_model,
        providers=providers,
        orig_img=orig_img,
        orig_ratio=orig_ratio,
        settings=settings,
        cfg=cfg,
        frame_timestamps=frame_timestamps_data,
    )
    return output_path


def _regenerate_storyboard_from_scratch(
    product_path: str,
    product_description: str,
    output_path: str,
    image_model: str,
    providers: dict,
    orig_img: "Image.Image",
    orig_ratio: float,
    settings,
    cfg,
    frame_timestamps: list = None,
):
    """
    方案3：不做编辑替换，而是根据产品图参考重新生成一张4x4分镜图。
    只需要1次API调用。
    """
    from app.services.image_generator import ImageGeneratorService
    from app.config import settings as _settings

    # 用 DeepSeek 生成产品外观描述
    product_visual_desc = product_description or ""
    try:
        from app.ai_models import get_model as _get_model
        analysis_model = _get_model(cfg.analysis_model, cfg) if cfg else None
        if analysis_model and not product_visual_desc:
            product_visual_desc = analysis_model.analyze_text(
                "Describe this product's visual appearance in 1-2 sentences (shape, color, material, size).",
                task="direct"
            ).strip()
    except Exception as e:
        logger.warning("Failed to get product description: %s", e)

    if not product_visual_desc:
        product_visual_desc = "the product shown in the reference image"

    # 构造重新生成的 prompt
    num_panels = 16
    prompt = (
        f"Generate a professional 4x4 grid product marketing storyboard (16 panels total) "
        f"for this product: {product_visual_desc}. "
        f"The reference image shows the EXACT product appearance — use it precisely. "
        f"Create 16 sequential panels showing a complete product marketing story: "
        f"Panel 1-2: Hook/attention grabber with the product. "
        f"Panel 3-4: Product reveal and first impression. "
        f"Panel 5-8: Key features demonstration (show the product being USED in its intended way). "
        f"Panel 9-11: Benefits and user reactions. "
        f"Panel 12-14: More usage scenarios and details. "
        f"Panel 15-16: Call to action and final product beauty shot. "
        f"STYLE: Clean, photorealistic product photography in each panel. "
        f"Each panel should show a DIFFERENT scene/angle of the product. "
        f"The product must look EXACTLY like the reference image in every panel. "
        f"4x4 grid layout, consistent product appearance across all panels."
    )

    logger.info("Regenerating storyboard from scratch with prompt length: %d", len(prompt))

    # 调用图片生成
    api_key = (
        providers.get("_laozhang_api_key")
        or getattr(_settings, "laozhang_api_key", "")
    )
    base_url = "https://api.laozhang.ai/v1"

    if not api_key:
        raise RuntimeError("Laozhang API key not configured")

    service = ImageGeneratorService(api_key=api_key, base_url=base_url)
    gen_model = "gpt-image-1"

    if orig_ratio > 1.2:
        output_aspect = "16:9"
    elif orig_ratio < 0.8:
        output_aspect = "9:16"
    else:
        output_aspect = "1:1"

    result = service.generate_image_with_reference(
        prompt=prompt,
        reference_image_path=product_path,  # 产品图作为参考
        model=gen_model,
        aspect_ratio=output_aspect,
    )

    image_url = result.get("image_url") or result.get("url") or ""
    if image_url:
        service.download_image(image_url, output_path)
    elif result.get("b64_json"):
        img_data = base64.b64decode(result["b64_json"])
        Path(output_path).write_bytes(img_data)
    else:
        raise RuntimeError(f"Image generation returned no usable output: {result}")

    # 缩放到原始尺寸
    from PIL import Image as PILImage
    result_img = PILImage.open(output_path)
    if result_img.size != orig_img.size:
        result_img = result_img.resize(orig_img.size, PILImage.Resampling.LANCZOS)
        result_img.save(output_path, quality=90)

    logger.info("Saved regenerated storyboard: %s", output_path)


def _replace_whole_storyboard(
    storyboard_path: str,
    product_path: str,
    product_description: str,
    output_path: str,
    image_model: str,
    providers: dict,
    orig_img: Image.Image,
    orig_ratio: float,
    settings,
):
    """Original whole-grid replacement logic, extracted for clarity."""
    from PIL import Image as PILImage

    # 先用视觉/分析模型识别产品图特征，让 prompt 更精确
    product_visual_desc = ""
    try:
        from app.ai_models import get_model as _get_model
        analysis_model = _get_model(cfg.analysis_model, cfg) if cfg else None
        if analysis_model:
            product_visual_desc = analysis_model.analyze_text(
                f"Describe the physical appearance of this product in detail (shape, color, material, distinctive features): {product_description or 'pet nail clipper'}. "
                f"Output 2-3 sentences describing ONLY its visual appearance.",
                task="direct"
            ).strip()
    except Exception as e:
        logger.warning("Failed to generate product visual description: %s", e)

    prompt = (
        "This is a 4x4 grid storyboard from a product marketing video. "
        "I want to REPLACE the product/tool shown in EVERY panel with a DIFFERENT product. "
        "The NEW product to use is shown in the second reference image. "
    )
    if product_visual_desc:
        prompt += f"The NEW product looks like: {product_visual_desc} "
    elif product_description:
        prompt += f"The NEW product is: {product_description}. "

    prompt += (
        "INSTRUCTIONS: "
        "1. In EVERY panel of this 4x4 grid, find the product/tool and replace it with the new product from the reference image. "
        "2. The new product must maintain the EXACT same position, angle, and scale as the original product in each panel. "
        "3. Keep ALL other elements UNCHANGED: backgrounds, hands, pets, people, lighting, composition. "
        "4. The 4x4 grid layout must remain intact. "
        "5. The new product must look photorealistic in each scene. "
        "6. If a panel shows the product being USED (e.g. trimming nails), show the NEW product performing that same action."
    )

    if image_model == "qwen-image-2.0-pro":
        import mimetypes
        from dashscope import MultiModalConversation
        import dashscope
        import requests as _requests

        dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

        aliyun_key = providers.get('_aliyun_api_key') or providers.get('aliyun', {}).get('api_key', '')
        if not aliyun_key:
            raise RuntimeError("Aliyun API key not configured")

        def img_to_base64(path):
            with open(path, 'rb') as f:
                data = f.read()
            mime, _ = mimetypes.guess_type(path)
            mime = mime or 'image/jpeg'
            return f"data:{mime};base64,{base64.b64encode(data).decode()}"

        storyboard_b64 = img_to_base64(storyboard_path)
        product_b64 = img_to_base64(product_path)

        if orig_ratio > 1.2:
            size = "1920*1088"
        elif orig_ratio < 0.8:
            size = "1088*1920"
        else:
            size = "1024*1024"

        messages = [
            {
                'role': 'user',
                'content': [
                    {'image': storyboard_b64},
                    {'image': product_b64},
                    {'text': prompt},
                ],
            }
        ]

        response = MultiModalConversation.call(
            api_key=aliyun_key,
            model='qwen-image-2.0-pro',
            messages=messages,
            stream=False,
            n=1,
            size=size,
        )

        if response.status_code != 200:
            raise RuntimeError(f"Aliyun image generation failed: {response.code} - {response.message}")

        image_url = None
        for content in response.output.choices[0].message.content:
            if 'image' in content:
                image_url = content['image']
                break

        if not image_url:
            raise RuntimeError("Aliyun returned no image output")

        img_resp = _requests.get(image_url, timeout=60)
        img_resp.raise_for_status()
        Path(output_path).write_bytes(img_resp.content)

    else:
        from app.services.image_generator import ImageGeneratorService

        api_key = (
            providers.get("_laozhang_api_key")
            or getattr(settings, "laozhang_api_key", "")
        )
        base_url = "https://api.laozhang.ai/v1"

        if not api_key:
            raise RuntimeError("Laozhang API key not configured")

        service = ImageGeneratorService(api_key=api_key, base_url=base_url)

        max_side = 1792
        if max(orig_img.width, orig_img.height) > max_side:
            if orig_img.width > orig_img.height:
                new_w = max_side
                new_h = int(max_side / orig_ratio)
            else:
                new_h = max_side
                new_w = int(max_side * orig_ratio)
            resized = orig_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            resized_path = storyboard_path.replace('.jpg', '_resized.jpg')
            resized.save(resized_path, quality=90)
            upload_path = resized_path
        else:
            upload_path = storyboard_path

        if orig_ratio > 1.2:
            output_aspect = "16:9"
        elif orig_ratio < 0.8:
            output_aspect = "9:16"
        else:
            output_aspect = "1:1"

        result = service.generate_image_with_reference(
            prompt=prompt,
            reference_image_path=upload_path,
            additional_references=[product_path],
            model="gpt-image-1",
            aspect_ratio=output_aspect,
        )

        image_url = result.get("image_url") or result.get("url") or ""
        if image_url:
            service.download_image(image_url, output_path)
        elif result.get("b64_json"):
            img_data = base64.b64decode(result["b64_json"])
            Path(output_path).write_bytes(img_data)
        else:
            raise RuntimeError(f"Image generation returned no usable output: {result}")

    result_img = Image.open(output_path)
    if result_img.size != orig_img.size:
        result_img = result_img.resize(orig_img.size, Image.Resampling.LANCZOS)
        result_img.save(output_path, quality=90)
        logger.info("Resized replaced image to original size %s", orig_img.size)

    logger.info("Saved replaced storyboard (whole-image): %s", output_path)


def generate_video_prompt_from_storyboard(
    frame_timestamps: str,
    frame_count: int,
    product_description: str,
    original_duration: float,
    target_duration: float,
    db,
    frame_metadata: Optional[List[dict]] = None,
) -> str:
    """
    改进5: 基于分镜图帧生成逐帧镜头指令。

    当 frame_metadata 存在时，为每帧生成一条具体的镜头指令；
    否则退回到原始的整段提示词生成。

    Args:
        frame_timestamps: JSON字符串，格式 [{"time": 1.5, "index": 0}, ...]
        frame_count: 关键帧数量
        product_description: 产品描述
        original_duration: 原视频时长
        target_duration: 目标时长（15秒）
        db: SQLAlchemy Session
        frame_metadata: 每帧结构化元数据列表（改进1生成）

    Returns:
        生成的视频提示词字符串
    """
    from app.ai_models import get_model
    from app.models.config import ModelConfig

    cfg = db.query(ModelConfig).first()
    analysis_model = get_model(cfg.analysis_model, cfg) if cfg else None
    if not analysis_model:
        raise RuntimeError("Analysis model not configured")

    try:
        timestamps = json.loads(frame_timestamps) if isinstance(frame_timestamps, str) else frame_timestamps
    except Exception:
        timestamps = []

    compression_ratio = target_duration / original_duration

    # --- Per-frame mode ---
    if frame_metadata and timestamps:
        total = min(len(timestamps), len(frame_metadata), 16)
        # Distribute target_duration evenly across frames
        frame_duration = target_duration / total

        frame_lines = []
        for i in range(total):
            meta = frame_metadata[i] if i < len(frame_metadata) else {}
            ts = timestamps[i] if i < len(timestamps) else {}
            shot_type = meta.get("shot_type", "medium")
            story_beat = meta.get("story_beat", "feature-demo")
            scene_desc = meta.get("scene_description", "")

            start_s = i * frame_duration
            end_s = (i + 1) * frame_duration

            shot_abbrev = {"close-up": "CU", "medium": "MS", "wide": "WS"}.get(shot_type, "MS")
            beat_hint = {
                "hook": "attention-grabbing opener",
                "product-reveal": "first product reveal",
                "feature-demo": "feature demonstration",
                "reaction": "emotional reaction or benefit",
                "cta": "call to action",
            }.get(story_beat, story_beat)

            frame_lines.append(
                f"Frame {i+1} ({start_s:.0f}-{end_s:.1f}s): "
                f"{shot_abbrev} - {beat_hint}. {scene_desc}"
            )

        frame_lines_text = "\n".join(frame_lines)

        per_frame_prompt = (
            f"You are a professional marketing video scriptwriter.\n\n"
            f"Task: Create a {target_duration:.0f}-second marketing video script for: {product_description}\n\n"
            f"Context:\n"
            f"- Original video: {original_duration:.0f}s → Target: {target_duration:.0f}s "
            f"(ratio: {compression_ratio:.2f})\n"
            f"- {total} keyframes, each ~{frame_duration:.1f}s\n\n"
            f"Pre-analyzed frame structure:\n{frame_lines_text}\n\n"
            f"Requirements:\n"
            f"1. Output the script in EXACTLY this format:\n"
            f"[Equipment] <camera/device>\n"
            f"[Video Style] <style>\n"
            f"[Video Music] <music type>\n"
            f"[Video Effects] <effects>\n"
            f"[Hook] <opening line>\n"
            f"[Video Content]\n"
            f"Frame 1 (0-{frame_duration:.1f}s): <shot type abbrev> - <specific action/visual>\n"
            f"Frame 2 ({frame_duration:.1f}-{frame_duration*2:.1f}s): <shot type abbrev> - <specific action/visual>\n"
            f"... (all {total} frames)\n"
            f"Frame {total} ({(total-1)*frame_duration:.1f}-{target_duration:.0f}s): "
            f"<shot type abbrev> - <specific action/visual>\n"
            f"[Product Consistency] <describe {product_description}>\n\n"
            f"2. Each Frame line must reference the specific story beat and scene from the pre-analyzed structure\n"
            f"3. Make it energetic, product-focused, and conversion-oriented\n"
            f"4. Write in English\n"
            f"5. Return ONLY the script, no explanations"
        )

        result = analysis_model.analyze_text(per_frame_prompt, task="direct")
        return result.strip()

    # --- Fallback: original whole-prompt mode ---
    frame_times_text = ", ".join([f"{t['time']:.1f}s" for t in timestamps[:10]])

    prompt = (
        f"You are a professional marketing video scriptwriter.\n\n"
        f"Task: Create a {target_duration:.0f}-second marketing video script for: {product_description}\n\n"
        f"Context:\n"
        f"- Original video duration: {original_duration:.0f}s → Target: {target_duration:.0f}s "
        f"(ratio: {compression_ratio:.2f})\n"
        f"- We extracted {frame_count} key frames at: {frame_times_text}\n"
        f"- These frames represent the major story beats of the original video\n\n"
        f"Requirements:\n"
        f"1. Create a complete {target_duration:.0f}s video script showcasing {product_description}\n"
        f"2. Use the standard format: [Equipment], [Video Style], [Video Music], [Video Effects], "
        f"[Hook], [Video Content], [Product Consistency]\n"
        f"3. [Video Content] should have shot-by-shot timestamps that total exactly {target_duration:.0f}s\n"
        f"4. Make it engaging, energetic, and product-focused\n"
        f"5. Hook should grab attention in first 2 seconds\n"
        f"6. Shots should flow naturally: intro → features → benefits → call-to-action\n"
        f"7. [Product Consistency] must describe: {product_description}\n"
        f"8. Write in English\n"
        f"9. Return ONLY the script, no explanations\n\n"
        f"Example structure:\n"
        f"[Equipment] iPhone 15 Pro Max...\n"
        f"[Video Style] Fast-paced product showcase...\n"
        f"[Video Music] Upbeat electronic...\n"
        f"[Video Effects] Quick cuts, zooms...\n"
        f"[Hook] Stop scrolling! Check this out...\n"
        f"[Video Content]\n"
        f"0-2s: Hook - Product reveal\n"
        f"2-5s: Feature 1 close-up\n"
        f"...\n"
        f"13-15s: Call to action\n"
        f"[Product Consistency] {product_description}\n"
    )

    result = analysis_model.analyze_text(prompt, task="direct")
    return result.strip()


def compress_video_prompt(
    original_prompt: str,
    original_duration: float,
    target_duration: float,
    product_description: str,
    db,
) -> str:
    """使用 LLM 将视频提示词压缩到目标时长，并替换产品引用。

    Args:
        original_prompt: 原始视频提示词。
        original_duration: 原始视频时长（秒）。
        target_duration: 目标时长（秒），通常为 15.0。
        product_description: 新产品描述，用于替换原提示词中的产品引用。
        db: SQLAlchemy Session，用于读取 ModelConfig。

    Returns:
        压缩并替换产品后的提示词字符串。
    """
    from app.ai_models import get_model
    from app.models.config import ModelConfig

    cfg = db.query(ModelConfig).first()
    if not cfg:
        raise RuntimeError("Model config not found in database")

    analysis_model = get_model(cfg.analysis_model, cfg)

    compression_ratio = target_duration / original_duration

    full_prompt = (
        f"You are a video script compression and adaptation expert.\n\n"
        f"Task: Compress and adapt the following video prompt.\n"
        f"Original duration: {original_duration:.0f}s → Target duration: {target_duration:.0f}s\n"
        f"Compression ratio: {compression_ratio:.2f}\n\n"
        f"New product to feature: {product_description}\n\n"
        f"Rules:\n"
        f"1. Keep the core story structure and hook from the original\n"
        f"2. Replace ALL product references with the new product\n"
        f"3. Adjust ALL shot durations proportionally to fit {target_duration:.0f}s total\n"
        f"4. Maintain the format: [Equipment], [Video Style], [Video Music], "
        f"[Video Effects], [Hook], [Video Content], [Product Consistency]\n"
        f"5. [Video Content] timestamps MUST total exactly {target_duration:.0f}s\n"
        f"6. Keep the video energetic and impactful despite shorter duration\n"
        f"7. [Product Consistency] must describe the new product: {product_description}\n"
        f"8. Output in English only\n"
        f"9. Return ONLY the compressed prompt, no explanations\n\n"
        f"Original {original_duration:.0f}s prompt to compress to {target_duration:.0f}s:\n\n"
        f"{original_prompt}"
    )

    compressed = analysis_model.analyze_text(full_prompt, "direct").strip()
    if not compressed:
        # Fallback: 如果压缩失败，返回一个基础模板
        compressed = (
            f"[Equipment] iPhone 15 Pro Max\n"
            f"[Video Style] Product showcase\n"
            f"[Video Music] Upbeat background music\n"
            f"[Video Effects] Quick cuts\n"
            f"[Hook] Check this out!\n"
            f"[Video Content]\n0-5s: Product reveal\n5-10s: Feature demonstration\n10-15s: Call to action\n"
            f"[Product Consistency] {product_description}"
        )
        logger.warning("LLM returned empty for prompt compression, using fallback template")
    return compressed


def product_replacement_pipeline(replication_id: str, image_model: str = None):
    """后台任务：产品替换 + 生成15秒视频提示词。

    Args:
        replication_id: StoryboardReplication ID
    """
    from app.models.report import Report
    from app.services.video_processor import get_video_info

    db = SessionLocal()
    try:
        replication = db.get(StoryboardReplication, replication_id)
        if not replication:
            logger.error("Replication not found: %s", replication_id)
            return

        video = db.get(Video, replication.video_id)
        if not video:
            logger.error("Video not found for replication: %s", replication_id)
            replication.status = "failed"
            replication.error = "Video not found"
            db.commit()
            return

        report = db.query(Report).filter(Report.video_id == str(video.id)).first()

        logger.info("Starting product replacement pipeline for replication: %s", replication_id)

        # Load saved frame_metadata (改进1)
        frame_metadata: Optional[List[dict]] = None
        if replication.frame_metadata:
            try:
                frame_metadata = json.loads(replication.frame_metadata)
            except Exception as e:
                logger.warning("Failed to parse frame_metadata: %s", e)

        # Step 1: 产品替换（改进4: 逐帧替换）
        replaced_path = replace_product_in_storyboard(
            storyboard_path=replication.storyboard_image_path,
            product_path=replication.product_image_path,
            product_description=replication.product_description or "",
            replication_id=replication_id,
            db=db,
            image_model_override=image_model,
            frame_metadata=frame_metadata,
        )
        replication.replaced_storyboard_path = replaced_path
        db.commit()
        logger.info("Product replacement done: %s", replaced_path)

        # Step 2: 获取原视频时长
        try:
            video_info = get_video_info(video.filepath)
            original_duration = video_info.get('duration', 30.0)
        except Exception as e:
            logger.warning("Failed to get video duration: %s, using 30s", e)
            original_duration = 30.0

        # Step 3: 生成提示词（改进5: 逐帧 or 整段）
        if report and report.prompt:
            logger.info("Using report prompt for compression, report id: %s", report.id)
            compressed = compress_video_prompt(
                original_prompt=report.prompt,
                original_duration=original_duration,
                target_duration=15.0,
                product_description=replication.product_description or "",
                db=db,
            )
        else:
            logger.info("No report prompt found, generating from storyboard frames")
            compressed = generate_video_prompt_from_storyboard(
                frame_timestamps=replication.frame_timestamps,
                frame_count=replication.frame_count or 8,
                product_description=replication.product_description or "",
                original_duration=original_duration,
                target_duration=15.0,
                db=db,
                frame_metadata=frame_metadata,
            )

        replication.compressed_prompt = compressed
        replication.original_duration = original_duration
        replication.status = "completed"
        db.commit()

        logger.info("Product replacement pipeline completed for replication: %s", replication_id)

    except Exception as e:
        logger.error("Product replacement pipeline failed for %s: %s", replication_id, e)
        logger.error(traceback.format_exc())

        try:
            replication = db.get(StoryboardReplication, replication_id)
            if replication:
                replication.status = "failed"
                replication.error = str(e)[:500]
                db.commit()
        except Exception as commit_error:
            logger.error("Failed to update error status: %s", commit_error)

    finally:
        db.close()
