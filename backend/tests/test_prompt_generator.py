from app.services.prompt_generator import TEMPLATES, build_generation_prompt


def test_templates_exist():
    assert "grwm" in TEMPLATES
    assert "unboxing" in TEMPLATES
    assert "comparison" in TEMPLATES


def test_each_template_has_required_fields():
    for key, tmpl in TEMPLATES.items():
        assert "name" in tmpl, f"Template {key} missing name"
        assert "structure" in tmpl, f"Template {key} missing structure"
        assert "{hook}" in tmpl["structure"], f"Template {key} missing hook placeholder"
        assert "{content}" in tmpl["structure"], f"Template {key} missing content placeholder"
        assert "{consistency}" in tmpl["structure"], f"Template {key} missing consistency placeholder"


def test_build_generation_prompt_contains_product_info():
    product_doc = {
        "title": "Wireless Earbuds",
        "appearance": "White matte finish, oval charging case",
        "selling_points": "ANC, 40h battery, IPX5",
    }
    prompt = build_generation_prompt(product_doc, "grwm")
    assert "Wireless Earbuds" in prompt
    assert "White matte finish" in prompt
    assert "GRWM" in prompt


def test_build_generation_prompt_fallback_template():
    product_doc = {"title": "Test Product"}
    prompt = build_generation_prompt(product_doc, "nonexistent_template")
    assert "GRWM" in prompt  # Falls back to grwm


def test_build_generation_prompt_english_requirement():
    product_doc = {"title": "Test"}
    prompt = build_generation_prompt(product_doc, "grwm")
    assert "entirely in English" in prompt


def test_build_generation_prompt_contains_aspect_ratio():
    product_doc = {"title": "Wireless Earbuds", "appearance": "White matte finish"}
    prompt = build_generation_prompt(product_doc, "grwm", aspect_ratio="9:16")
    assert "9:16" in prompt


def test_build_generation_prompt_contains_grid_layout():
    product_doc = {"title": "Wireless Earbuds", "appearance": "White matte finish"}
    prompt = build_generation_prompt(product_doc, "grwm", aspect_ratio="16:9", grid_layout="2x3")
    assert "2x3" in prompt or "6-grid" in prompt.lower()
