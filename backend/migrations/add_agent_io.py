"""Add input_fields & output_fields to agent_prompts and seed descriptive IO data."""
import json
import sys
sys.path.insert(0, ".")

from sqlalchemy import text
from app.database import engine, SessionLocal, Base
from app.models.agent_prompt import AgentPrompt

# ── I/O definitions for each agent ─────────────────────────
AGENT_IO = {
    "replica_vision_analysis": {
        "inputs": [
            {"name": "frames", "label": "关键帧图片", "desc": "FFmpeg 均匀提取的6帧视频关键帧", "type": "image[]"},
            {"name": "frame_count", "label": "帧数量", "desc": "传入的帧总数", "type": "number"},
        ],
        "outputs": [
            {"name": "frame_analysis", "label": "帧分析JSON", "desc": "每帧的结构化描述：画面内容、摄像机角度、光线、构图、情绪、主体", "type": "json[]"},
        ],
    },
    "replica_strategy": {
        "inputs": [
            {"name": "frame_analysis", "label": "帧分析结果", "desc": "视觉帧分析 agent 输出的结构化JSON", "type": "json[]"},
            {"name": "transcript", "label": "语音转文字", "desc": "Whisper 提取的口播文案 + 时间戳", "type": "text"},
            {"name": "duration", "label": "视频时长", "desc": "原视频总时长（秒）", "type": "number"},
        ],
        "outputs": [
            {"name": "strategy_report", "label": "营销策略报告", "desc": "Markdown格式：核心策略·受众画像·钩子评级·情感共鸣·传播评分·复制清单", "type": "markdown"},
        ],
    },
    "replica_shots": {
        "inputs": [
            {"name": "frame_analysis", "label": "帧分析结果", "desc": "视觉帧分析 agent 输出的结构化JSON", "type": "json[]"},
            {"name": "transcript", "label": "语音转文字", "desc": "Whisper 口播文案 + 时间戳", "type": "text"},
        ],
        "outputs": [
            {"name": "shot_breakdown", "label": "分镜拆解JSON", "desc": "按时间轴逐镜头拆解：序号·时间戳·画面描述·机位·构图·台词·目的", "type": "json[]"},
        ],
    },
    "replica_prompt_gen": {
        "inputs": [
            {"name": "shot_breakdown", "label": "分镜拆解", "desc": "分镜分析 agent 输出的逐镜头JSON", "type": "json[]"},
            {"name": "transcript", "label": "语音转文字", "desc": "口播文案 + 时间戳", "type": "text"},
        ],
        "outputs": [
            {"name": "video_prompt", "label": "AI视频提示词", "desc": "英文提示词，含 STYLE·MOOD·CAMERA·LIGHTING·每镜详细描述，可直接贴入 Sora/Kling/Pika", "type": "text"},
        ],
    },
    "replica_script_framework": {
        "inputs": [
            {"name": "strategy_report", "label": "策略报告", "desc": "营销策略 agent 输出的Markdown报告", "type": "markdown"},
            {"name": "shot_breakdown", "label": "分镜拆解", "desc": "逐镜头JSON", "type": "json[]"},
            {"name": "transcript", "label": "口播文案", "desc": "Whisper 转写文案", "type": "text"},
        ],
        "outputs": [
            {"name": "script_framework", "label": "脚本框架", "desc": "可复刻的脚本结构：开场Hook公式·镜头节奏·台词模版·CTA策略·仿写规则", "type": "json"},
        ],
    },
    "replica_blueprint": {
        "inputs": [
            {"name": "script_framework", "label": "脚本框架", "desc": "脚本框架分析 agent 的输出", "type": "json"},
            {"name": "video_prompt", "label": "逆向提示词", "desc": "逆向提示词 agent 的输出", "type": "text"},
            {"name": "shot_breakdown", "label": "分镜拆解", "desc": "完整分镜JSON（用于筛选）", "type": "json[]"},
        ],
        "outputs": [
            {"name": "blueprint", "label": "复刻蓝图", "desc": "筛选后的关键分镜·保留/丢弃决策·产品替换点·每个关键分镜的复刻参数", "type": "json"},
        ],
    },
    "replica_creative_rewrite": {
        "inputs": [
            {"name": "blueprint", "label": "复刻蓝图", "desc": "中控 agent 的筛选+替换规划", "type": "json"},
            {"name": "product_info", "label": "产品信息", "desc": "用户输入的替换产品名称·卖点·外观描述", "type": "text"},
            {"name": "n", "label": "生成数量", "desc": "期望生成的创意角度数量", "type": "number"},
        ],
        "outputs": [
            {"name": "creative_results", "label": "创意改写结果", "desc": "N个创意角度 + 每个角度的完整AI视频提示词", "type": "json[]"},
        ],
    },
    "replica_storyboard_gen": {
        "inputs": [
            {"name": "blueprint", "label": "复刻蓝图", "desc": "中控 agent 筛选的关键分镜+替换规划", "type": "json"},
            {"name": "product_info", "label": "产品信息", "desc": "目标产品描述", "type": "text"},
            {"name": "target_duration", "label": "目标时长", "desc": "目标视频时长（秒）", "type": "number"},
            {"name": "compression_ratio", "label": "压缩比", "desc": "原视频/目标时长比", "type": "number"},
        ],
        "outputs": [
            {"name": "storyboard_script", "label": "分镜复刻脚本", "desc": "完整TikTok视频脚本：[Equipment][Video Style]…[Hook][Video Content][Product Consistency]", "type": "text"},
        ],
    },
    # ── Product pipeline agents ──
    "product_image_analyzer": {
        "inputs": [{"name": "product_images", "label": "产品图片", "desc": "从产品页面爬取/上传的图片", "type": "image[]"}],
        "outputs": [{"name": "image_analysis", "label": "图片分析JSON", "desc": "三层分析：基础识别·产品理解·创意用法", "type": "json[]"}],
    },
    "image_filter": {
        "inputs": [{"name": "image_analysis", "label": "图片分析结果", "desc": "product_image_analyzer 的JSON输出", "type": "json[]"}],
        "outputs": [{"name": "filtered_indices", "label": "过滤后索引", "desc": "实际产品图片的索引数组", "type": "json[]"}],
    },
    "product_appearance_extractor": {
        "inputs": [{"name": "reference_image", "label": "参考产品图", "desc": "筛选后的最佳产品图", "type": "image"}],
        "outputs": [{"name": "appearance_desc", "label": "外观描述", "desc": "产品外观纯文本描述：形状·颜色·材质·比例·特征", "type": "text"}],
    },
    "reference_image_picker": {
        "inputs": [{"name": "image_descriptions", "label": "图片描述列表", "desc": "所有产品图片的文本描述", "type": "text"}],
        "outputs": [{"name": "best_image", "label": "最佳图片", "desc": "选出的最适合做参考图的文件名", "type": "text"}],
    },
    "product_doc_generator": {
        "inputs": [
            {"name": "product_info", "label": "产品信息", "desc": "标题·描述·图片分析结果", "type": "text"},
            {"name": "appearance_desc", "label": "外观描述", "desc": "product_appearance_extractor 的输出", "type": "text"},
        ],
        "outputs": [{"name": "product_doc", "label": "产品文档", "desc": "结构化JSON：标题·描述·类目·外观·卖点·使用步骤·提示·警告", "type": "json"}],
    },
    "instruction_board_generator": {
        "inputs": [{"name": "product_doc", "label": "产品文档", "desc": "product_doc_generator 的结构化JSON", "type": "json"}],
        "outputs": [{"name": "instruction_prompt", "label": "说明书提示词", "desc": "产品使用说明书图片的生成提示词", "type": "text"}],
    },
    "video_script_generator": {
        "inputs": [
            {"name": "product_doc", "label": "产品文档", "desc": "结构化产品文档", "type": "json"},
            {"name": "template", "label": "视频模板", "desc": "选中的视频风格模板", "type": "json"},
        ],
        "outputs": [{"name": "scripts", "label": "视频脚本", "desc": "10个不同Hook策略的TikTok视频脚本JSON数组", "type": "json[]"}],
    },
    "prompt_refiner": {
        "inputs": [
            {"name": "original_prompt", "label": "原始提示词", "desc": "待优化的视频脚本", "type": "text"},
            {"name": "instruction", "label": "用户指令", "desc": "优化方向说明", "type": "text"},
        ],
        "outputs": [{"name": "refined_prompt", "label": "优化后提示词", "desc": "按用户指令优化后的完整视频脚本", "type": "text"}],
    },
    "hook_picker": {
        "inputs": [
            {"name": "product_info", "label": "产品信息", "desc": "产品标题+描述", "type": "text"},
            {"name": "hook_strategies", "label": "Hook策略池", "desc": "可用的Hook策略列表", "type": "text[]"},
        ],
        "outputs": [{"name": "selected_hook", "label": "选中Hook", "desc": "最适合该产品的Hook策略key", "type": "text"}],
    },
    "single_prompt_regenerator": {
        "inputs": [
            {"name": "template", "label": "脚本模板", "desc": "产品+视频风格模板", "type": "json"},
            {"name": "hook_strategy", "label": "Hook策略", "desc": "指定的Hook策略", "type": "text"},
        ],
        "outputs": [{"name": "script", "label": "单条脚本", "desc": "一条完整的TikTok视频脚本", "type": "text"}],
    },
    "storyboard_filler": {
        "inputs": [
            {"name": "template", "label": "故事板模板", "desc": "含 {{placeholders}} 的模板文本", "type": "text"},
            {"name": "script", "label": "视频脚本", "desc": "完整的TikTok视频脚本", "type": "text"},
        ],
        "outputs": [{"name": "filled_prompt", "label": "故事板图片提示词", "desc": "填充了占位符的图片生成提示词", "type": "text"}],
    },
    "multi_panel_storyboard": {
        "inputs": [
            {"name": "script", "label": "视频脚本", "desc": "完整的TikTok视频脚本", "type": "text"},
            {"name": "panel_count", "label": "分镜格数", "desc": "宫格数（如3x3=9）", "type": "number"},
        ],
        "outputs": [{"name": "storyboard_prompt", "label": "多宫格提示词", "desc": "N格分镜的图片生成提示词", "type": "text"}],
    },
    "single_image_prompt": {
        "inputs": [{"name": "script", "label": "视频脚本", "desc": "TikTok视频脚本", "type": "text"}],
        "outputs": [{"name": "image_prompt", "label": "单图提示词", "desc": "带产品一致性约束的图片生成提示词", "type": "text"}],
    },
    "video_to_image_converter": {
        "inputs": [{"name": "script", "label": "视频脚本", "desc": "TikTok视频格式脚本", "type": "text"}],
        "outputs": [{"name": "image_prompt", "label": "图片提示词", "desc": "去除视频标签、保留产品外观的图片生成提示词", "type": "text"}],
    },
}


def run():
    # Add columns (safe if already exist)
    with engine.begin() as conn:
        for col in ("input_fields", "output_fields"):
            try:
                conn.execute(text(f"ALTER TABLE agent_prompts ADD COLUMN {col} TEXT DEFAULT '[]'"))
                print(f"  Added column: {col}")
            except Exception as e:
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    print(f"  Column {col} already exists, skipping")
                else:
                    raise

    # Seed I/O data
    db = SessionLocal()
    try:
        prompts = db.query(AgentPrompt).all()
        updated = 0
        for ap in prompts:
            io = AGENT_IO.get(ap.key)
            if io:
                ap.input_fields = json.dumps(io["inputs"], ensure_ascii=False)
                ap.output_fields = json.dumps(io["outputs"], ensure_ascii=False)
                updated += 1
        db.commit()
        print(f"  Seeded I/O for {updated}/{len(prompts)} agents")
    finally:
        db.close()


if __name__ == "__main__":
    run()
