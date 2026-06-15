"""Migration: Add video_templates and image_layout_templates tables.

Run this script to create the template tables and seed with existing templates.
Usage: python -m migrations.add_template_tables
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import engine, SessionLocal
from app.models.template import VideoTemplate, ImageLayoutTemplate, HookTemplate, Base


# Existing video templates from prompt_generator.py
VIDEO_TEMPLATES = {
    "grwm": {
        "name": "GRWM 随性博主",
        "structure": (
            "[Equipment] Shot with iPhone front camera\n"
            "[Video Style] TikTok GRWM (Get Ready With Me), casual influencer style\n"
            "[Video Music] Upbeat trending pop\n"
            "[Video Effects] Jump cuts, outfit transition, text overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "unboxing": {
        "name": "开箱测评",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, overhead angle\n"
            "[Video Style] TikTok unboxing, ASMR-style with close-ups\n"
            "[Video Music] Lo-fi chill beat\n"
            "[Video Effects] Slow-mo reveals, zoom transitions, text overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "pov": {
        "name": "POV 第一人称",
        "structure": (
            "[Equipment] Shot with iPhone handheld, first-person perspective\n"
            "[Video Style] TikTok POV (Point of View), immersive experience\n"
            "[Video Music] Trending audio or voiceover\n"
            "[Video Effects] Smooth transitions, text captions, immersive angles\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "tutorial": {
        "name": "教程演示",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, stable tripod\n"
            "[Video Style] TikTok tutorial, step-by-step demonstration\n"
            "[Video Music] Soft background music\n"
            "[Video Effects] Step numbers, arrows, text annotations, zoom-ins\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "vlog": {
        "name": "日常 Vlog",
        "structure": (
            "[Equipment] Shot with iPhone, natural handheld\n"
            "[Video Style] TikTok daily vlog, authentic lifestyle integration\n"
            "[Video Music] Chill indie or acoustic\n"
            "[Video Effects] Natural cuts, subtle filters, casual text\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "storytelling": {
        "name": "剧情反转",
        "structure": (
            "[Equipment] Shot with iPhone, cinematic angles\n"
            "[Video Style] TikTok storytelling with plot twist\n"
            "[Video Music] Dramatic build-up music\n"
            "[Video Effects] Suspenseful cuts, reveal transitions, text punchline\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "asmr": {
        "name": "ASMR 特写",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, macro close-ups\n"
            "[Video Style] TikTok ASMR, satisfying textures and sounds\n"
            "[Video Music] Ambient sounds or soft ASMR audio\n"
            "[Video Effects] Slow motion, extreme close-ups, smooth pans\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "challenge": {
        "name": "挑战种草",
        "structure": (
            "[Equipment] Shot with iPhone, dynamic angles\n"
            "[Video Style] TikTok challenge or trending format\n"
            "[Video Music] Viral trending sound\n"
            "[Video Effects] Fast cuts, energetic transitions, hashtag overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
}

# Image layout conversion templates
IMAGE_LAYOUT_TEMPLATES = {
    "storyboard_6panel": {
        "name": "6-Panel Storyboard",
        "prompt_template": (
            "You are a professional storyboard artist. Given a TikTok video script, create a 6-panel storyboard image prompt. "
            "IMPORTANT RULES:\n"
            "1. Include the FULL original video script at the beginning for context.\n"
            "2. After the script, add a storyboard instruction section.\n"
            "3. Break the video story into 6 panels based on the natural story flow — do NOT force a fixed structure.\n"
            "4. Each panel should describe the key visual: character pose, camera angle, product placement, lighting, mood.\n"
            "5. Preserve exact product appearance from [Product Consistency] section.\n"
            "6. Output in English, under 1500 characters total.\n\n"
            "OUTPUT FORMAT:\n"
            "[Original Script]\n<paste the full original script here>\n\n"
            "[Storyboard Instruction]\n"
            "Create a 3x2 grid of 6 sequential storyboard panels based on the video story:\n"
            "Panel 1: <describe scene>\n"
            "Panel 2: <describe scene>\n"
            "Panel 3: <describe scene>\n"
            "Panel 4: <describe scene>\n"
            "Panel 5: <describe scene>\n"
            "Panel 6: <describe scene>\n"
            "Keep consistent character appearance across all panels. Preserve exact product design."
        ),
    },
    "single_keyframe": {
        "name": "Single Keyframe",
        "prompt_template": (
            "You are an expert at converting video scripts to image generation prompts. "
            "Extract the key visual elements (character, action, setting, lighting, composition) from the video script. "
            "Remove all bracketed tags like [Equipment], [Video Style], etc. "
            "Preserve product details from [Product Consistency] section. "
            "Output a concise English paragraph (under 500 chars) optimized for AI image generation. "
            "Start with 'Keep the product exactly as shown, preserving all details. Only change the background and scene.' "
            "No explanations, just the prompt."
        ),
    },
}


HOOK_TEMPLATES = {
    "pain_point": {
        "name": "Pain Point Solution",
        "description": "Opens by identifying a relatable daily pain point, then positions the product as the solution.",
        "examples": [
            "[Daily Activity] just got a problem. If you're tired of [Pain Point], try this [Product].",
            "Struggling with [Pain Point] every single day? This [Product] changed everything for me.",
        ],
    },
    "tough_love": {
        "name": "Tough Love / Controversial Truth",
        "description": "Starts with a bold or controversial statement to grab attention and challenge common beliefs.",
        "examples": [
            "Don't hate me, but [Controversial Statement]. To be honest, [Common Belief] is not working anymore.",
            "I know this is unpopular, but [Controversial Truth]. Here's what actually works.",
        ],
    },
    "product_replacement": {
        "name": "Product Replacement",
        "description": "Directly tells viewers to ditch their old product and switch to the new one.",
        "examples": [
            "Take your old [Product] and get rid of it. Stop using [Old Product]. This [New Product] does it better.",
            "Throw away your [Old Product]. I found something that actually works.",
        ],
    },
    "doing_it_wrong": {
        "name": "You've Been Doing It Wrong",
        "description": "Hooks viewers by implying they've been making a mistake, creating curiosity and urgency.",
        "examples": [
            "You're probably using [Product Category] the wrong way. This is why your [Problem] keeps happening.",
            "Stop doing [Common Habit] — you've been doing it wrong this whole time.",
        ],
    },
    "instant_curiosity": {
        "name": "Instant Curiosity",
        "description": "Creates immediate curiosity with a surprising or unexpected result that makes viewers want to know more.",
        "examples": [
            "I didn't expect this to work, but it did. I wish someone showed me this sooner.",
            "This shouldn't work, but somehow it does. Watch till the end.",
        ],
    },
    "problem_agitation": {
        "name": "Problem Agitation",
        "description": "Amplifies a frustrating problem to make viewers feel understood before offering relief.",
        "examples": [
            "Still dealing with [Annoying Problem]? If [Pain Point] drives you crazy, watch this.",
            "If [Problem] is ruining your day, you need to see this right now.",
        ],
    },
    "smart_shortcut": {
        "name": "Smart Shortcut",
        "description": "Positions the product as a time-saving hack or smarter way to accomplish a common task.",
        "examples": [
            "Here's the easier way to [Task]. This saves me so much time every single day.",
            "Why do it the hard way? This [Product] cuts [Task] down to seconds.",
        ],
    },
    "direct_recommendation": {
        "name": "Direct Recommendation",
        "description": "Cuts straight to a confident, direct product recommendation without buildup.",
        "examples": [
            "If you buy one thing for [Use Case], make it this. This might be the most useful [Product Category] I own.",
            "Best [Product Category] I've ever bought. No contest.",
        ],
    },
    "before_after": {
        "name": "Before / After Tension",
        "description": "Creates contrast between a messy before state and a satisfying after, building emotional tension.",
        "examples": [
            "My [Situation] before this? A mess. One small upgrade changed everything.",
            "Before: [Negative State]. After: [Positive State]. All because of this one thing.",
        ],
    },
    "social_proof": {
        "name": "Social Proof Feel",
        "description": "Leverages the bandwagon effect by referencing widespread popularity before sharing a personal experience.",
        "examples": [
            "I kept seeing people talk about this, so I tried it. Now I get why everyone is obsessed with this.",
            "Everyone on my feed had this. I finally caved. They were right.",
        ],
    },
}


def migrate():
    """Create tables and seed initial data."""
    print("Creating template tables...")
    Base.metadata.create_all(bind=engine, tables=[
        VideoTemplate.__table__,
        ImageLayoutTemplate.__table__,
        HookTemplate.__table__,
    ])

    db = SessionLocal()
    try:
        # Seed video templates
        print("Seeding video templates...")
        for key, data in VIDEO_TEMPLATES.items():
            existing = db.query(VideoTemplate).filter(VideoTemplate.key == key).first()
            if not existing:
                template = VideoTemplate(
                    key=key,
                    name=data["name"],
                    structure=data["structure"],
                    is_custom=False,  # Built-in templates
                    is_active=True,
                )
                db.add(template)
                print(f"  Added: {key} - {data['name']}")
            else:
                print(f"  Skipped (exists): {key}")

        # Seed image layout templates
        print("Seeding image layout templates...")
        for key, data in IMAGE_LAYOUT_TEMPLATES.items():
            existing = db.query(ImageLayoutTemplate).filter(ImageLayoutTemplate.key == key).first()
            if not existing:
                template = ImageLayoutTemplate(
                    key=key,
                    name=data["name"],
                    prompt_template=data["prompt_template"],
                    is_custom=False,  # Built-in templates
                    is_active=True,
                )
                db.add(template)
                print(f"  Added: {key} - {data['name']}")
            else:
                print(f"  Skipped (exists): {key}")

        # Seed hook templates
        import json as _json
        print("Seeding hook templates...")
        for key, data in HOOK_TEMPLATES.items():
            existing = db.query(HookTemplate).filter(HookTemplate.key == key).first()
            if not existing:
                template = HookTemplate(
                    key=key,
                    name=data["name"],
                    description=data["description"],
                    examples=_json.dumps(data["examples"]),
                    is_custom=False,  # Built-in templates
                    is_active=True,
                )
                db.add(template)
                print(f"  Added: {key} - {data['name']}")
            else:
                print(f"  Skipped (exists): {key}")

        db.commit()
        print("Migration completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()

