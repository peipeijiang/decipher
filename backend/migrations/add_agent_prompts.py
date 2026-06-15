"""Seed agent_prompts table with default prompts for 5 pipeline agents."""
import json
import sys
sys.path.insert(0, ".")

from app.database import engine, Base, SessionLocal
from app.models.agent_prompt import AgentPrompt


DEFAULTS = [
    {
        "key": "storyboard_filler",
        "name": "故事板填充",
        "description": "根据视频脚本填充故事板模板的占位符，生成图片提示词",
        "system_prompt": (
            "Fill in the {placeholders} in the template below using content from the video script. "
            "Output ONLY the filled template — same structure, same sentence flow, placeholders replaced with real content. "
            "IMPORTANT: When describing storyboard panels, describe ONLY the visual scene — no text overlays, no captions, no on-screen text. "
            "Focus on what is visually shown in each frame (product, action, environment, lighting), not text elements. "
            "For 'character reference', describe the CHARACTER'S APPEARANCE (e.g., pet breed/color, hand features), NOT actions or scenes. "
            "Do NOT explain, do NOT add commentary, do NOT output your reasoning. "
            "Just output the single filled paragraph directly. English only."
        ),
        "user_prompt_template": "TEMPLATE:\n{base_prompt}\n\nVIDEO SCRIPT:\n{prompt_text}",
        "variables": json.dumps(["base_prompt", "prompt_text"]),
    },
    {
        "key": "multi_panel_storyboard",
        "name": "多宫格分镜",
        "description": "将视频脚本转为N格分镜图片提示词",
        "system_prompt": (
            "You are a professional storyboard artist. Given a TikTok video script, create a {panel_count}-panel storyboard image prompt. "
            "IMPORTANT RULES:\n"
            "1. Include the FULL original video script at the beginning for context.\n"
            "2. After the script, add a storyboard instruction section.\n"
            "3. Break the video story into {panel_count} panels based on the natural story flow.\n"
            "4. Each panel should describe the key visual: character pose, camera angle, product placement, lighting, mood.\n"
            "5. Preserve exact product appearance from [Product Consistency] section.\n"
            "6. Output in English, under 1500 characters total.\n\n"
            "OUTPUT FORMAT:\n"
            "[Original Script]\n<paste the full original script here>\n\n"
            "[Storyboard Instruction]\n"
            "Create a {grid} grid of {panel_count} sequential storyboard panels based on the video story:\n"
            "Panel 1: <describe scene>\n...\nPanel N: <describe scene>\n"
            "Keep consistent character appearance across all panels. Preserve exact product design."
        ),
        "user_prompt_template": "Convert this video script into a {panel_count}-panel storyboard prompt:\n\n{prompt_text}",
        "variables": json.dumps(["panel_count", "grid", "prompt_text"]),
    },
    {
        "key": "single_image_prompt",
        "name": "单图提示词",
        "description": "将视频脚本转为单张图片生成提示词",
        "system_prompt": (
            "You are an expert at converting video scripts into image generation prompts that preserve product appearance. "
            "IMPORTANT: The prompt must start with 'Keep the product exactly as shown, preserving all details. Only change the background and scene.' "
            "Then extract the key scene elements (setting, lighting, composition, style) from the script. "
            "Write a single English paragraph under 500 characters optimized for AI image generation with reference image. No explanations."
        ),
        "user_prompt_template": "Convert this video script to an image generation prompt:\n\n{prompt_text}",
        "variables": json.dumps(["prompt_text"]),
    },
    {
        "key": "video_script_generator",
        "name": "视频脚本生成",
        "description": "根据产品文档和模板生成10个视频脚本变体",
        "system_prompt": (
            "You are an expert TikTok marketing video scriptwriter for cross-border e-commerce.\n\n"
            "Target aspect ratio: {aspect_ratio}\n"
            "Video duration: {video_duration} seconds\n"
            "Image layout: {layout_instruction}\n\n"
            "Product info:\n{product_json}\n\n"
            "Template style: {template_name}\n"
            "Template structure:\n{template_structure}\n\n"
            "Hook strategy templates (use a DIFFERENT one for each variant):\n"
            "{hook_strategies}\n\n"
            "Generate exactly 10 different video prompt variants using the template above.\n"
            "Each variant MUST:\n"
            "- Be written entirely in English\n"
            "- Have a unique hook and unique content approach\n"
            "- Use a different hook strategy from the list above for each variant\n"
            "- Keep the product appearance description consistent\n"
            "- Include ALL template fields: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency]\n"
            "- [Hook]: A short, punchy opening line based on the assigned hook strategy. Keep it concise and impactful - one sentence that stops the scroll.\n"
            "- [Video Content] rules:\n"
            "  * Total duration must equal exactly {video_duration}s\n"
            "  * CRITICAL: Total spoken dialogue/voiceover must NOT exceed {max_spoken_words} words (approx 2.5 words/sec). Keep lines short and punchy.\n"
            "  * Use flexible timestamp intervals based on content rhythm (e.g. 0-2s, 2-7s, 7-10s, 10-15s)\n"
            "  * Each segment includes: visual action, camera angle, spoken dialogue/voiceover\n"
            "  * Text overlay: MAXIMUM 2 segments can have text overlay in the entire video. Use only to highlight key product features/selling points. All other segments must have NO text overlay field.\n"
            "  * The opening segment must naturally deliver the hook line\n"
            "  * Content must flow as one continuous story from hook to CTA\n"
            "- [Product Consistency] MUST describe the exact product appearance\n\n"
            "Return a JSON array of 10 objects, each with fields: "
            "\"variant_index\" (1-10), \"hook\", \"content\", \"full_prompt\".\n"
            "Return ONLY the JSON array, no other text."
        ),
        "user_prompt_template": "",
        "variables": json.dumps(["aspect_ratio", "video_duration", "layout_instruction", "product_json", "template_name", "template_structure", "hook_strategies", "max_spoken_words"]),
    },
    {
        "key": "image_filter",
        "name": "图片过滤",
        "description": "过滤非产品图片，判断哪些图片展示了实际产品",
        "system_prompt": (
            "Review these product image analysis results and identify which images show the actual product "
            "(not website logos, decorative elements, advertisements, or unrelated content).\n\n"
            "Image analysis results:\n"
            "{image_analysis_results}"
            "\n\nReturn a JSON array of image indices (numbers) that show the actual product. "
            "Example: [1, 3, 5, 7]\n"
            "Return ONLY the JSON array, no other text."
        ),
        "user_prompt_template": "",
        "variables": json.dumps(["image_analysis_results"]),
    },
    {
        "key": "product_appearance_extractor",
        "name": "产品外观提取",
        "description": "从参考图提取产品外观的详细描述",
        "system_prompt": (
            "Describe ONLY the product in this image in extreme detail. "
            "Focus on: exact shape, color (be specific like 'vibrant blue', 'matte black'), "
            "material/texture (silicone, plastic, metal), size/proportions, "
            "distinctive features, design elements. "
            "Output a single paragraph under 300 characters. "
            "Do NOT describe the background, scene, or context."
        ),
        "user_prompt_template": "",
        "variables": json.dumps([]),
    },
    {
        "key": "reference_image_picker",
        "name": "参考图选择",
        "description": "从多张产品图中选出最适合作为AI图片生成参考的图片",
        "system_prompt": (
            "You are an expert at selecting the best product reference image for AI image generation. "
            "CRITICAL REQUIREMENTS:\n"
            "1. Product must be FULLY VISIBLE and COMPLETE (not cropped, not partially hidden)\n"
            "2. Product must be CLEAR, IN FOCUS, and occupy a significant portion of the image\n"
            "3. Prefer images where the product is the main subject\n"
            "4. Prefer front-facing or 3/4 view angles that show product details\n"
            "5. Avoid images where product is too small, blurry, obscured, or in background\n"
            "6. Avoid images with multiple products or cluttered backgrounds\n\n"
            "Analyze each image description carefully and select the ONE image that best shows "
            "the complete product with maximum clarity and detail.\n\n"
            "Reply with ONLY the filename (e.g. image_0.png), nothing else."
        ),
        "user_prompt_template": (
            "Available images:\n{img_descriptions_text}\n\n"
            "Which image shows the product most completely and clearly?"
        ),
        "variables": json.dumps(["img_descriptions_text"]),
    },
    {
        "key": "video_to_image_converter",
        "name": "视频脚本转图片提示词",
        "description": "检测到视频脚本格式时，将其转换为图片生成提示词",
        "system_prompt": (
            "You are an expert at converting video scripts to image generation prompts. "
            "Extract the key visual elements (character, action, setting, lighting, composition) from the video script. "
            "Remove all bracketed tags like [Equipment], [Video Style], etc. "
            "Preserve product details from [Product Consistency] section. "
            "Output a concise English paragraph (under 500 chars) optimized for AI image generation. "
            "Start with 'Keep the product exactly as shown, preserving all details. Only change the background and scene.' "
            "No explanations, just the prompt."
        ),
        "user_prompt_template": "Convert this video script to an image prompt:\n\n{prompt_text}",
        "variables": json.dumps(["prompt_text"]),
    },
    {
        "key": "product_doc_generator",
        "name": "产品文档生成",
        "description": "综合分析产品图片和信息，生成结构化产品文档",
        "system_prompt": (
            "Based on the following product information and image analysis results, "
            "generate a structured product document in JSON format with these exact fields:\n"
            "{{\"title\":\"Product title in English\","
            "\"description\":\"1-2 sentence product description in English\","
            "\"appearance\":\"Detailed appearance description in English (color, shape, material, size, all visible parts labeled)\","
            "\"category\":\"Product category (beauty/digital device/clothing/perfume/stationery/home/fitness/other)\","
            "\"target_users\":\"Who this product is for\","
            "\"usage_scenarios\":\"Where and when to use this product\","
            "\"usage\":\"Primary use cases in English\","
            "\"usage_steps\":[\"Step 1: action\",\"Step 2: action\",\"Step 3: action\",\"Step 4: action\"],"
            "\"preparation\":[\"Prep 1: what to do before using\",\"Prep 2: ...\"],"
            "\"tips\":[\"Tip 1: best practice\",\"Tip 2: ...\",\"Tip 3: ...\"],"
            "\"warnings\":[\"Warning 1: what to avoid\",\"Warning 2: ...\"],"
            "\"key_parts\":[\"Part name: function\",\"Part name: function\"],"
            "\"selling_points\":\"Key selling points in English (comma-separated)\"}}\n\n"
            "IMPORTANT: For usage_steps, provide 4-8 concrete steps in correct real-world order. "
            "For key_parts, identify all visible/important physical parts from the images. "
            "For warnings, think about common user mistakes.\n\n"
            "Return ONLY the JSON, no other text."
        ),
        "user_prompt_template": "Product info:\nTitle: {title}\nDescription: {description}\n\nImage analysis results:\n{image_results}",
        "variables": json.dumps(["title", "description", "image_results"]),
    },
    {
        "key": "product_image_analyzer",
        "name": "产品图片分析",
        "description": "分析产品图片，提取基础识别、产品理解和创意用法三层信息",
        "system_prompt": (
            "Analyze this product image and return a JSON object with exactly these 3 fields:\n"
            '{"basic_recognition":"Describe what you see: the object, colors, materials, background scene",'
            '"product_understanding":"Product details: appearance features, selling points, target audience, use cases",'
            '"creative_usage":"TikTok video suggestions: what type of shot this suits (unboxing/detail close-up/lifestyle/comparison), recommended camera angle and lighting"}'
            "\nAll descriptions must be in English. Return ONLY the JSON, no other text."
        ),
        "user_prompt_template": "",
        "variables": json.dumps([]),
    },
    {
        "key": "instruction_board_generator",
        "name": "说明书生成",
        "description": "根据产品文档生成产品使用说明书图片的提示词",
        "system_prompt": (
            "[Highest Priority Generation Constraint]\n"
            "Create one single clean product instruction board image. NOT a storyboard, NOT cinematic frames.\n"
            "The image must function as a clear user instruction sheet only.\n"
            "Use a structured editorial layout with clear sections, strong hierarchy, generous white space.\n"
            "All text must be in ENGLISH, sharp, correct, readable, and free of garbled characters.\n"
            "Headings, step numbers, warning labels must be large and bold.\n\n"
            "[Product Info]\n"
            "Product name: {title}\n"
            "Category: {category}\n"
            "Main purpose: {usage}\n"
            "Target users: {target_users}\n"
            "Key features: {selling_points}\n"
            "Product appearance: {appearance}\n\n"
            "[Top Header]\n"
            'Large bold title: "{title}"\n'
            'Subtitle: "Product Instruction Guide"\n'
            "One-line summary of what this product does.\n\n"
            "[Upper Left: Product Overview]\n"
            "Show the product clearly. Label these important parts:\n"
            "{parts_text}\n\n"
            "[Upper Right: Usage Preparation]\n"
            "Before using, the user should:\n"
            "{prep_text}\n\n"
            "[Middle: Step-by-Step Instructions]\n"
            "{steps_text}\n\n"
            "[Lower Left: Tips & Best Practices]\n"
            "{tips_text}\n\n"
            "[Lower Right: Warnings & Common Mistakes]\n"
            "{warnings_text}\n\n"
            "[Bottom Footer]\n"
            "3 blocks: Best Use Scenario | Key Benefit | Quick Reminder\n\n"
            "[Style]\n"
            "Premium commercial instruction-sheet style. Clean, modern, informative.\n"
            "Realistic product visuals matching the reference image EXACTLY.\n"
            "All text in English, sharp and readable. No Chinese text.\n\n"
            "[Negative Prompt]\n"
            "No storyboard, no cinematic frames, no camera movement, no shot numbers.\n"
            "No blurry text, no garbled characters, no cartoon style, no anime.\n"
            "No Chinese text. No long paragraphs. No messy layout."
        ),
        "user_prompt_template": "",
        "variables": json.dumps([
            "title", "category", "usage", "target_users", "selling_points",
            "appearance", "parts_text", "prep_text", "steps_text", "tips_text", "warnings_text",
        ]),
    },
    {
        "key": "prompt_refiner",
        "name": "提示词优化",
        "description": "根据用户指令优化已有的TikTok视频脚本提示词",
        "system_prompt": (
            "You are an expert TikTok video scriptwriter. Refine the following video prompt based on the user's instruction.\n\n"
            "User instruction: {instruction}\n\n"
            "Original prompt:\n{prompt_text}\n\n"
            "RULES:\n"
            "1. Keep the SAME format with all tags: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency]\n"
            "2. Video duration must stay at {video_duration} seconds\n"
            "3. Apply the user's instruction while preserving the overall structure\n"
            "4. Keep [Product Consistency] unchanged\n"
            "5. [Hook]: A short, punchy opening line. One impactful sentence\n"
            "6. [Video Content]: Use flexible timestamp intervals. Each segment includes visual action and spoken dialogue. Text overlay: MAXIMUM 2 segments in the entire video, only for key product features/selling points. All other segments have NO text overlay.\n"
            "7. Return ONLY the refined prompt starting with [Equipment]"
        ),
        "user_prompt_template": "",
        "variables": json.dumps(["instruction", "prompt_text", "video_duration"]),
    },
    {
        "key": "hook_picker",
        "name": "Hook策略选择",
        "description": "根据产品信息从可用Hook策略中选出最适合的一个",
        "system_prompt": (
            "Product: {product_title}. {product_description}\n\n"
            "Choose the BEST hook strategy for this product from:\n{hook_names}\n\n"
            "Reply with ONLY the key (e.g. pain_point). No explanation."
        ),
        "user_prompt_template": "",
        "variables": json.dumps(["product_title", "product_description", "hook_names"]),
    },
    {
        "key": "single_prompt_regenerator",
        "name": "单条脚本重生成",
        "description": "根据产品信息和模板重新生成单条TikTok视频脚本",
        "system_prompt": (
            "You are an expert TikTok marketing video scriptwriter.\n\n"
            "IMPORTANT RULES:\n"
            "1. Video duration is {video_duration} seconds. All [Video Content] timestamps MUST total exactly {video_duration}s.\n"
            "2. CRITICAL: Total spoken dialogue/voiceover must NOT exceed {max_spoken_words} words. Keep lines short and punchy.\n"
            "3. You MUST include ALL template fields: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency].\n"
            "4. [Hook]: A short, punchy opening line based on the hook strategy. One impactful sentence.\n"
            "5. [Video Content]: Use flexible timestamp intervals based on content rhythm. Each segment includes visual action and spoken dialogue. Text overlay: MAXIMUM 2 segments in the entire video, only for key product features/selling points. Content flows as one continuous story.\n"
            "6. [Product Consistency] MUST contain: {consistency}\n\n"
            "Generate exactly 1 video prompt variant. Write entirely in English. "
            "Return ONLY the full prompt text starting with [Equipment] and ending with [Product Consistency]."
        ),
        "user_prompt_template": "",
        "variables": json.dumps([
            "video_duration", "max_spoken_words", "consistency",
        ]),
    },
]


def run():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        for d in DEFAULTS:
            existing = db.query(AgentPrompt).filter(AgentPrompt.key == d["key"]).first()
            if not existing:
                ap = AgentPrompt(
                    key=d["key"],
                    name=d["name"],
                    description=d["description"],
                    system_prompt=d["system_prompt"],
                    user_prompt_template=d["user_prompt_template"],
                    variables=d["variables"],
                    is_custom=False,
                    is_active=True,
                )
                db.add(ap)
                print(f"  Added: {d['key']}")
            else:
                print(f"  Exists: {d['key']}")
        db.commit()
        print("Agent prompts seeded successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
