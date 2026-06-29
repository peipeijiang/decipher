"""Scene detection and intelligent keyframe extraction."""
import logging
import subprocess
from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Similarity threshold: frames with histogram correlation > this are considered duplicates
DEFAULT_SIMILARITY_THRESHOLD = 0.90


def detect_scene_changes(video_path: str, threshold: float = 30.0) -> List[float]:
    """
    使用 ffmpeg 的 scene detect 检测场景变化

    Args:
        video_path: 视频文件路径
        threshold: 场景变化阈值 (0-100, 默认30)

    Returns:
        场景变化时间点列表 (秒)
    """
    try:
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-vf", f"select='gt(scene,{threshold/100})',showinfo",
            "-f", "null",
            "-"
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        scene_times = []
        for line in result.stderr.split('\n'):
            if 'pts_time:' in line:
                try:
                    pts_time = line.split('pts_time:')[1].split()[0]
                    scene_times.append(float(pts_time))
                except (IndexError, ValueError):
                    continue

        return sorted(set(scene_times))

    except subprocess.TimeoutExpired:
        logger.warning("Scene detection timeout for %s", video_path)
        return []
    except Exception as e:
        logger.warning("Scene detection failed for %s: %s", video_path, e)
        return []


def smart_extract_keyframes(
    video_path: str,
    target_duration: float = 15.0,
    report_shots: Optional[str] = None,
) -> Tuple[List[dict], List[float]]:
    """
    智能提取关键帧 - 用AI视觉模型理解画面内容，选出最能还原故事情节的帧

    流程：
    1. 密集采样候选帧（每1.5秒一帧）
    2. 用视觉模型描述每帧内容
    3. 用LLM分析所有帧描述，选出最能还原完整故事的关键帧
    4. 对选出的帧去重
    5. 为每帧生成结构化元数据

    Args:
        video_path: 视频文件路径
        target_duration: 目标压缩时长（秒）
        report_shots: 关联 Report 的 shots JSON 字符串（可选），用于引导 AI 选帧

    Returns:
        (frames, timestamps)
        每个 frame dict 包含: {"time": float, "image": np.ndarray, "metadata": dict}
    """
    from app.services.video_processor import get_video_info

    video_info = get_video_info(video_path)
    duration = video_info.get('duration')
    if not duration:
        raise ValueError(f"Cannot determine video duration: {video_path}")

    # 根据视频时长动态决定采样间隔
    if duration <= 15:
        sample_interval = 0.4
    elif duration <= 30:
        sample_interval = 0.6
    elif duration <= 60:
        sample_interval = 1.0
    else:
        sample_interval = 1.5

    candidate_timestamps = []
    t = 0.3
    while t < duration - 0.2:
        candidate_timestamps.append(t)
        t += sample_interval

    if candidate_timestamps and candidate_timestamps[-1] < duration - 1.0:
        candidate_timestamps.append(duration - 0.5)

    logger.info("Video %.1fs: sampling %d candidate frames", duration, len(candidate_timestamps))

    candidate_frames = []
    for ts in candidate_timestamps:
        try:
            frame_array = extract_frame_at(video_path, ts)
            candidate_frames.append({"time": ts, "image": frame_array})
        except Exception as e:
            logger.warning("Failed to extract frame at %.2fs: %s", ts, e)
            continue

    if not candidate_frames:
        raise RuntimeError(f"No frames extracted from {video_path}")

    selected_frames = _ai_select_keyframes(candidate_frames, duration, report_shots=report_shots)

    if not selected_frames:
        logger.warning("AI keyframe selection failed, falling back to scene detection")
        selected_frames = _fallback_select(candidate_frames, duration)

    # Deduplicate and ensure target count
    selected_frames = _deduplicate_frames(selected_frames, candidate_frames, target=16)

    # Generate structured metadata for each selected frame
    selected_frames = _generate_frame_metadata(selected_frames)

    logger.info("Final: selected %d keyframes from %d candidates", len(selected_frames), len(candidate_frames))
    return selected_frames, [f["time"] for f in selected_frames]


def _generate_frame_metadata(frames: List[dict]) -> List[dict]:
    """
    为已选帧批量生成结构化元数据（shot_type, product_position,
    scene_description, story_beat），通过一次 LLM 调用完成。

    Args:
        frames: 已选帧列表，每项含 "time" 和 "image"

    Returns:
        原列表中每帧增加 "metadata" 字段后的新列表（不修改输入）
    """
    import json
    import tempfile
    import os
    from PIL import Image

    try:
        from app.database import SessionLocal
        from app.models.config import ModelConfig
        from app.ai_models import get_model

        db = SessionLocal()
        try:
            cfg = db.query(ModelConfig).first()
            if not cfg:
                return _attach_empty_metadata(frames)
            vision_model = get_model(cfg.vision_model, cfg)
            analysis_model = get_model(cfg.analysis_model, cfg)
        finally:
            db.close()

        if not vision_model or not analysis_model:
            return _attach_empty_metadata(frames)

        # Step 1: Use vision model to get a brief description of each frame
        frame_descriptions = []
        for idx, frame_data in enumerate(frames):
            img = Image.fromarray(frame_data['image'])
            img_small = img.resize((256, int(256 * img.height / img.width)), Image.Resampling.LANCZOS)

            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                img_small.save(tmp, format='JPEG', quality=70)
                tmp_path = tmp.name

            try:
                if vision_model.SUPPORTS_VISION:
                    result = vision_model.analyze_frames([tmp_path])
                    desc = result[0].get('basic_recognition', '') if result else f"Frame at {frame_data['time']:.1f}s"
                else:
                    desc = f"Frame at {frame_data['time']:.1f}s"
            except Exception as e:
                desc = f"Frame at {frame_data['time']:.1f}s"
                logger.warning("Vision analysis failed for metadata frame %d: %s", idx, e)
            finally:
                os.unlink(tmp_path)

            frame_descriptions.append({
                "index": idx,
                "time": frame_data['time'],
                "description": desc[:300],
            })

        # Step 2: Ask LLM to classify each frame into structured metadata
        frames_text = "\n".join(
            f"{fd['index']}: {fd['time']:.1f}s - {fd['description']}"
            for fd in frame_descriptions
        )

        meta_prompt = (
            f"You are analyzing {len(frames)} keyframes from a product marketing video.\n\n"
            f"For each frame below, output structured metadata in JSON.\n\n"
            f"Frames:\n{frames_text}\n\n"
            f"Return a JSON array with one object per frame (in order). Each object:\n"
            f'{{\n'
            f'  "shot_type": "close-up" | "medium" | "wide",\n'
            f'  "product_position": "center" | "left" | "right" | "hand-held",\n'
            f'  "scene_description": "<one concise English sentence>",\n'
            f'  "story_beat": "hook" | "product-reveal" | "feature-demo" | "reaction" | "cta"\n'
            f'}}\n\n'
            f"Return ONLY the JSON array, no markdown, no explanation."
        )

        raw = analysis_model.analyze_text(meta_prompt, task="direct")
        if not raw:
            logger.warning("LLM returned empty response for frame metadata generation")
            return _attach_empty_metadata(frames)

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        metadata_list = json.loads(raw)
        if not isinstance(metadata_list, list):
            return _attach_empty_metadata(frames)

        result_frames = []
        for idx, frame_data in enumerate(frames):
            meta = metadata_list[idx] if idx < len(metadata_list) else {}
            # Validate and sanitise
            validated_meta = {
                "shot_type": meta.get("shot_type", "medium"),
                "product_position": meta.get("product_position", "center"),
                "scene_description": meta.get("scene_description", f"Frame at {frame_data['time']:.1f}s"),
                "story_beat": meta.get("story_beat", "feature-demo"),
            }
            result_frames.append({**frame_data, "metadata": validated_meta})

        return result_frames

    except Exception as e:
        logger.warning("Frame metadata generation error: %s", e)
        return _attach_empty_metadata(frames)


def _attach_empty_metadata(frames: List[dict]) -> List[dict]:
    """Attach a default empty metadata dict to each frame without LLM calls."""
    result = []
    for frame_data in frames:
        meta = {
            "shot_type": "medium",
            "product_position": "center",
            "scene_description": f"Frame at {frame_data['time']:.1f}s",
            "story_beat": "feature-demo",
        }
        result.append({**frame_data, "metadata": meta})
    return result


def _compute_histogram(image: np.ndarray) -> np.ndarray:
    """Compute a normalised per-channel histogram for a numpy RGB image."""
    histograms = []
    for channel in range(3):
        hist, _ = np.histogram(image[:, :, channel], bins=64, range=(0, 256))
        histograms.append(hist.astype(np.float32))
    combined = np.concatenate(histograms)
    norm = np.linalg.norm(combined)
    return combined / norm if norm > 0 else combined


def _histogram_similarity(img_a: np.ndarray, img_b: np.ndarray) -> float:
    """Return correlation-based similarity in [0, 1] between two images."""
    hist_a = _compute_histogram(img_a)
    hist_b = _compute_histogram(img_b)
    # Correlation: dot product of normalised histograms
    return float(np.dot(hist_a, hist_b))


def _deduplicate_frames(
    frames: List[dict],
    candidates: List[dict],
    target: int = 16,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> List[dict]:
    """
    去重：移除与前一帧视觉相似度 > threshold 的帧，不足时从候选帧补充差异最大的帧。

    Args:
        frames: AI 选出的帧列表
        candidates: 全部候选帧（用于补充）
        target: 目标帧数（默认16）
        similarity_threshold: 相似度阈值，超过则去重（默认0.90）

    Returns:
        去重并补充后的帧列表
    """
    if not frames:
        return frames

    deduplicated: List[dict] = [frames[0]]

    for frame in frames[1:]:
        prev = deduplicated[-1]
        similarity = _histogram_similarity(prev['image'], frame['image'])
        if similarity <= similarity_threshold:
            deduplicated.append(frame)
        else:
            logger.debug(
                "Dropped duplicate frame at %.2fs (similarity=%.3f with %.2fs)",
                frame['time'], similarity, prev['time'],
            )

    logger.info("After deduplication: %d frames (was %d)", len(deduplicated), len(frames))

    # If below target, fill from candidates not already in deduplicated
    if len(deduplicated) < target and candidates:
        selected_times = {f['time'] for f in deduplicated}
        remaining = [c for c in candidates if c['time'] not in selected_times]

        # Rank remaining by minimum similarity to any already-selected frame:
        # prefer frames that are most visually different from all current selections
        def _min_similarity_to_selected(candidate: dict) -> float:
            sims = [_histogram_similarity(candidate['image'], s['image']) for s in deduplicated]
            return min(sims) if sims else 0.0

        remaining.sort(key=_min_similarity_to_selected)  # ascending: lowest sim first

        needed = target - len(deduplicated)
        for candidate in remaining[:needed]:
            deduplicated.append(candidate)
            logger.debug("Added diverse candidate frame at %.2fs to reach target", candidate['time'])

        # Re-sort by time after adding extras
        deduplicated.sort(key=lambda f: f['time'])

    return deduplicated


def _ai_select_keyframes(
    candidate_frames: List[dict],
    duration: float,
    report_shots: Optional[str] = None,
) -> List[dict]:
    """
    用AI视觉模型分析帧内容，然后用LLM选出最能还原故事的帧。

    Args:
        candidate_frames: 候选帧列表
        duration: 视频总时长
        report_shots: 可选的 Report shots JSON，作为 AI 选帧的参考
    """
    import json
    import os
    import tempfile
    from PIL import Image

    try:
        from app.database import SessionLocal
        from app.models.config import ModelConfig
        from app.ai_models import get_model

        db = SessionLocal()
        try:
            cfg = db.query(ModelConfig).first()
            if not cfg:
                return []

            vision_model = get_model(cfg.vision_model, cfg) if cfg else None
            analysis_model = get_model(cfg.analysis_model, cfg) if cfg else None

            if not vision_model or not analysis_model:
                return []
        finally:
            db.close()

        # Step 1: 用视觉模型描述每帧内容
        frame_descriptions = []
        for idx, frame_data in enumerate(candidate_frames):
            img = Image.fromarray(frame_data['image'])
            img_small = img.resize((384, int(384 * img.height / img.width)), Image.Resampling.LANCZOS)

            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                img_small.save(tmp, format='JPEG', quality=70)
                tmp_path = tmp.name

            try:
                if vision_model.SUPPORTS_VISION:
                    result = vision_model.analyze_frames([tmp_path])
                    desc = result[0].get('basic_recognition', '') if result else f"Frame at {frame_data['time']:.1f}s"
                else:
                    desc = f"Frame at {frame_data['time']:.1f}s"
            except Exception as e:
                desc = f"Frame at {frame_data['time']:.1f}s"
                logger.warning("Vision analysis failed for frame %d: %s", idx, e)
            finally:
                os.unlink(tmp_path)

            frame_descriptions.append({
                "index": idx,
                "time": frame_data['time'],
                "description": desc[:200]
            })

        # Step 2: 用LLM分析所有帧描述，选出关键帧
        target_count = 16

        frames_text = "\n".join(
            f"{fd['index']}: {fd['time']:.1f}s - {fd['description']}"
            for fd in frame_descriptions
        )

        # Build optional shots reference section
        shots_section = ""
        if report_shots:
            try:
                shots_data = json.loads(report_shots) if isinstance(report_shots, str) else report_shots
                if shots_data:
                    shots_lines = []
                    for i, shot in enumerate(shots_data):
                        if isinstance(shot, dict):
                            shot_desc = shot.get('description') or shot.get('content') or str(shot)
                            shot_beat = shot.get('story_beat') or shot.get('beat') or ''
                            beat_suffix = f" [{shot_beat}]" if shot_beat else ""
                            shots_lines.append(f"  Shot {i+1}: {shot_desc}{beat_suffix}")
                    if shots_lines:
                        shots_section = (
                            "\n\nReference story beats from existing analysis:\n"
                            + "\n".join(shots_lines)
                            + "\nUse these beats to guide which frames you select — "
                            "pick frames that best represent each story beat.\n"
                        )
            except Exception as e:
                logger.warning("Failed to parse report_shots for selection prompt: %s", e)

        select_prompt = (
            f"从以下{len(frame_descriptions)}个视频帧中选出{target_count}个关键帧。\n\n"
            f"{frames_text}"
            f"{shots_section}\n\n"
            f"要求：包含开头和结尾，覆盖所有场景转换，时间均匀分布，"
            f"确保每个故事节拍（hook/product-reveal/feature-demo/reaction/cta）都有代表帧。\n"
            f"直接返回JSON数组，如 [0,3,5,8,11,14,17,20,23,26,29,31,33,35,36,37]\n"
            f"只返回数组，不要任何解释。"
        )

        raw = analysis_model.analyze_text(select_prompt, task="direct")
        if not raw:
            logger.warning("Primary model returned empty for keyframe selection, trying deepseek")
            try:
                fallback_model = get_model("deepseek", cfg)
                raw = fallback_model.analyze_text(select_prompt, task="direct")
            except Exception as e:
                logger.warning("DeepSeek fallback also failed: %s", e)
                return []

        if not raw:
            return []

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        selected_indices = json.loads(raw)
        if not isinstance(selected_indices, list):
            return []

        selected_frames = []
        for idx in selected_indices:
            if isinstance(idx, int) and 0 <= idx < len(candidate_frames):
                selected_frames.append(candidate_frames[idx])

        return selected_frames if len(selected_frames) >= 4 else []

    except Exception as e:
        logger.warning("AI keyframe selection error: %s", e)
        import traceback
        traceback.print_exc()
        return []


def _fallback_select(candidate_frames: List[dict], duration: float) -> List[dict]:
    """Fallback: 均匀采样16帧"""
    target_count = 16
    step = max(1, len(candidate_frames) // target_count)
    return [candidate_frames[i] for i in range(0, len(candidate_frames), step)][:target_count]


def extract_frame_at(video_path: str, timestamp: float) -> np.ndarray:
    """
    在指定时间点提取帧

    Args:
        video_path: 视频文件路径
        timestamp: 时间戳（秒）

    Returns:
        RGB格式的numpy数组 (height, width, 3)
    """
    import cv2

    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise ValueError(f"Failed to extract frame at {timestamp}s")

    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
