# 产品视频生成功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product video generation module to ViralLens that takes a product URL, scrapes product info/images, generates marketing video prompts, creates keyframe images via Image 2.0, and generates videos via SeedDance 2.0.

**Architecture:** New `products` domain alongside existing `videos` domain. Reuses existing AI model infrastructure (`AIModel` base class, `ModelConfig`, `get_model` factory). Adds two new external API integrations (Image 2.0, SeedDance 2.0) and a web scraper service. Frontend adds a new `ProductPage` with kanban-style pipeline cards.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, BeautifulSoup4, Pillow, React 18, TypeScript, TailwindCSS

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/app/models/product.py` | Product SQLAlchemy model |
| `backend/app/models/product_prompt.py` | ProductPrompt SQLAlchemy model |
| `backend/app/schemas/product.py` | Pydantic schemas for Product + ProductPrompt |
| `backend/app/api/products.py` | All product-related API routes |
| `backend/app/services/scraper.py` | Web scraping: fetch page, extract images/info |
| `backend/app/services/product_analyzer.py` | AI 3-layer image recognition + doc generation |
| `backend/app/services/prompt_generator.py` | Template-based prompt variant generation |
| `backend/app/ai_models/image_model.py` | Image 2.0 (laozhang) API integration |
| `backend/app/ai_models/seedance_model.py` | SeedDance 2.0 (volcengine) API integration |
| `backend/app/tasks/product_pipeline.py` | Background pipeline: scrape → analyze → prompts |
| `backend/tests/test_scraper.py` | Scraper unit tests |
| `backend/tests/test_prompt_generator.py` | Prompt generator unit tests |
| `backend/tests/test_product_api.py` | Product API integration tests |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/app/models/config.py` | Add `image_model` and `video_gen_model` columns |
| `backend/app/config.py` | Add `laozhang_api_key` and `volcengine_api_key` |
| `backend/main.py` | Import and include `products` router |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/pages/ProductPage.tsx` | Main product video generation page |
| `frontend/src/types/product.ts` | TypeScript types for Product + ProductPrompt |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `/product` route |
| `frontend/src/api/client.ts` | Add product API functions |
| `frontend/src/components/layout/Sidebar.tsx` | Add product page nav link |

---

## Model Usage Summary

| Pipeline Step | Model Group | Default |
|--------------|-------------|---------|
| Image recognition (3-layer) | Vision model (existing `vision_model`) | openai |
| Product doc generation | Analysis model (existing `analysis_model`) | openai |
| Prompt generation (10 variants) | Analysis model (existing `analysis_model`) | openai |
| Image generation | Image model (new `image_model`) | laozhang-image-2-vip |
| Video generation | Video gen model (new `video_gen_model`) | seedance-2.0 |

---

## Task 1: Data Models (Product + ProductPrompt)

**Files:**
- Create: `backend/app/models/product.py`
- Create: `backend/app/models/product_prompt.py`
- Modify: `backend/app/models/config.py:9-40`

- [ ] **Step 1: Create Product model**

```python
# backend/app/models/product.py
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    url: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    images_dir: Mapped[str] = mapped_column(String, default="")
    doc_path: Mapped[str] = mapped_column(String, default="")
    doc_json_path: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Create ProductPrompt model**

```python
# backend/app/models/product_prompt.py
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ProductPrompt(Base):
    __tablename__ = "product_prompts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    template_name: Mapped[str] = mapped_column(String, default="")
    variant_index: Mapped[int] = mapped_column(Integer, default=1)
    prompt_text: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String, nullable=True)
    image_status: Mapped[str] = mapped_column(String, default="pending")
    video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    video_path: Mapped[str | None] = mapped_column(String, nullable=True)
    video_status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: Extend ModelConfig with image_model and video_gen_model**

In `backend/app/models/config.py`, add after the `analysis_model` field:

```python
    image_model: Mapped[str] = mapped_column(String, default="laozhang-image-2-vip")
    video_gen_model: Mapped[str] = mapped_column(String, default="seedance-2.0")
```

- [ ] **Step 4: Add new env vars to config.py**

In `backend/app/config.py`, add to the `Settings` class:

```python
    laozhang_api_key: str = ""
    volcengine_api_key: str = ""
    products_dir: str = "products"
```

- [ ] **Step 5: Import models in main.py to trigger table creation**

In `backend/main.py`, add imports alongside existing model imports:

```python
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
```

- [ ] **Step 6: Verify tables are created**

Run: `cd backend && python -c "from app.database import engine, Base; from app.models.product import Product; from app.models.product_prompt import ProductPrompt; Base.metadata.create_all(bind=engine); print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/product.py backend/app/models/product_prompt.py backend/app/models/config.py backend/app/config.py backend/main.py
git commit -m "feat: add Product and ProductPrompt data models"
```

---

## Task 2: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/product.py`

- [ ] **Step 1: Create product schemas**

```python
# backend/app/schemas/product.py
from datetime import datetime
from pydantic import BaseModel


class ProductCreate(BaseModel):
    url: str


class ProductOut(BaseModel):
    id: str
    url: str
    title: str
    description: str
    status: str
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductPromptOut(BaseModel):
    id: str
    product_id: str
    template_name: str
    variant_index: int
    prompt_text: str
    image_url: str | None = None
    image_status: str
    video_url: str | None = None
    video_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductDocOut(BaseModel):
    title: str
    description: str
    appearance: str
    usage: str
    selling_points: str
    images: list[dict]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/product.py
git commit -m "feat: add product Pydantic schemas"
```

---

## Task 3: Web Scraper Service

**Files:**
- Create: `backend/app/services/scraper.py`
- Create: `backend/tests/test_scraper.py`

- [ ] **Step 1: Install dependencies**

Run: `cd backend && pip install beautifulsoup4 lxml Pillow`

Add to `backend/requirements.txt`:
```
beautifulsoup4
lxml
Pillow
```

- [ ] **Step 2: Write scraper test**

```python
# backend/tests/test_scraper.py
import pytest
from unittest.mock import patch, MagicMock
from app.services.scraper import extract_product_info, download_images


SAMPLE_HTML = """
<html>
<head>
<meta property="og:title" content="Test Product" />
<meta property="og:description" content="A great product" />
<meta property="og:image" content="https://example.com/img1.jpg" />
<script type="application/ld+json">
{"@type": "Product", "name": "Test Product", "image": ["https://example.com/img2.jpg"]}
</script>
</head>
<body>
<h1>Test Product</h1>
<img src="https://example.com/img1.jpg" width="800" height="600" />
<img src="https://example.com/img3.jpg" width="800" height="600" />
<img src="https://example.com/icon.png" width="32" height="32" />
</body>
</html>
"""


def test_extract_product_info_from_og_and_jsonld():
    info = extract_product_info(SAMPLE_HTML, "https://example.com/product")
    assert info["title"] == "Test Product"
    assert info["description"] == "A great product"
    assert "https://example.com/img1.jpg" in info["image_urls"]
    assert "https://example.com/img2.jpg" in info["image_urls"]
    assert "https://example.com/img3.jpg" in info["image_urls"]


def test_extract_filters_small_images():
    info = extract_product_info(SAMPLE_HTML, "https://example.com/product")
    # icon.png (32x32) should be filtered out based on width/height attrs
    assert "https://example.com/icon.png" not in info["image_urls"]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_scraper.py -v`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement scraper**

```python
# backend/app/services/scraper.py
"""Web scraper for extracting product info and images from URLs."""
import hashlib
import json
import logging
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# URL path keywords that indicate non-product images
_FILTER_KEYWORDS = {"icon", "logo", "sprite", "banner", "ad", "pixel", "tracking", "avatar", "favicon"}


def fetch_page(url: str) -> str:
    """Fetch HTML content from a URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


def extract_product_info(html: str, url: str) -> dict:
    """Extract product title, description, and image URLs from HTML.

    Returns:
        {"title": str, "description": str, "image_urls": list[str]}
    """
    soup = BeautifulSoup(html, "lxml")

    title = _extract_title(soup)
    description = _extract_description(soup)
    image_urls = _extract_image_urls(soup, url)

    return {"title": title, "description": description, "image_urls": image_urls}


def download_images(image_urls: list[str], output_dir: str) -> list[str]:
    """Download images to output_dir, deduplicate by content hash.

    Returns list of saved file paths.
    """
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    seen_hashes: set[str] = set()
    saved: list[str] = []

    for i, img_url in enumerate(image_urls):
        try:
            resp = requests.get(img_url, timeout=15)
            resp.raise_for_status()

            content_hash = hashlib.md5(resp.content).hexdigest()
            if content_hash in seen_hashes:
                continue
            seen_hashes.add(content_hash)

            ext = _guess_extension(resp.headers.get("content-type", ""), img_url)
            filename = f"original_{len(saved) + 1}{ext}"
            filepath = output / filename
            filepath.write_bytes(resp.content)
            saved.append(str(filepath))
        except Exception as e:
            logger.warning("Failed to download %s: %s", img_url, e)

    return saved


def scrape_product(url: str, output_dir: str) -> dict:
    """Full scrape pipeline: fetch page → extract info → download images.

    Returns:
        {"title": str, "description": str, "image_urls": list[str], "image_paths": list[str]}
    """
    html = fetch_page(url)
    info = extract_product_info(html, url)
    image_paths = download_images(info["image_urls"], output_dir)
    return {**info, "image_paths": image_paths}


def _extract_title(soup: BeautifulSoup) -> str:
    """Extract title from OG, JSON-LD, or <title> tag."""
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        return og["content"].strip()

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict) and data.get("name"):
                return data["name"].strip()
        except (json.JSONDecodeError, TypeError):
            pass

    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        return title_tag.string.strip()

    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)

    return ""


def _extract_description(soup: BeautifulSoup) -> str:
    """Extract description from OG, meta description, or JSON-LD."""
    og = soup.find("meta", property="og:description")
    if og and og.get("content"):
        return og["content"].strip()

    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        return meta["content"].strip()

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict) and data.get("description"):
                return data["description"].strip()
        except (json.JSONDecodeError, TypeError):
            pass

    return ""


def _extract_image_urls(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Extract and deduplicate product image URLs."""
    urls: list[str] = []
    seen: set[str] = set()

    def _add(u: str) -> None:
        u = urljoin(base_url, u).split("?")[0] if not u.startswith("data:") else ""
        if u and u not in seen and not _is_filtered(u):
            seen.add(u)
            urls.append(u)

    # Priority 1: OG image
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        _add(og["content"])

    # Priority 2: JSON-LD images
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict):
                imgs = data.get("image", [])
                if isinstance(imgs, str):
                    imgs = [imgs]
                for img in imgs:
                    if isinstance(img, str):
                        _add(img)
        except (json.JSONDecodeError, TypeError):
            pass

    # Priority 3: <img> tags with reasonable size
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src:
            continue
        w = img.get("width", "")
        h = img.get("height", "")
        try:
            if w and h and (int(w) < 100 or int(h) < 100):
                continue
        except ValueError:
            pass
        _add(src)

    return urls


def _is_filtered(url: str) -> bool:
    """Check if URL matches filter keywords."""
    lower = url.lower()
    return any(kw in lower for kw in _FILTER_KEYWORDS)


def _guess_extension(content_type: str, url: str) -> str:
    """Guess file extension from content-type or URL."""
    ct_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    for ct, ext in ct_map.items():
        if ct in content_type:
            return ext
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if ext in url.lower():
            return ext
    return ".jpg"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_scraper.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/scraper.py backend/tests/test_scraper.py backend/requirements.txt
git commit -m "feat: add web scraper service with tests"
```

---

## Task 4: Product Analyzer Service

**Files:**
- Create: `backend/app/services/product_analyzer.py`

- [ ] **Step 1: Create product analyzer with 3-layer recognition prompt**

```python
# backend/app/services/product_analyzer.py
"""Product image recognition (3-layer) and document generation."""
import json
import logging
from pathlib import Path

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

PRODUCT_IMAGE_PROMPT = (
    "Analyze this product image and return a JSON object with exactly these fields:\n"
    '{"basic_recognition":"Describe what you see: object, colors, materials, scene",'
    '"product_understanding":"Product details: appearance, features, selling points, target audience, use cases",'
    '"creative_usage":"Video creative suggestions: what type of TikTok shot this image suits (unboxing/detail close-up/lifestyle/comparison), recommended camera angle and lighting"}'
    "\nReturn ONLY the JSON, no other text."
)

PRODUCT_DOC_PROMPT = (
    "Based on the following product information and image analysis results, "
    "generate a structured product document in the following JSON format:\n"
    '{{"title":"Product title in English",'
    '"description":"1-2 sentence product description in English",'
    '"appearance":"Detailed appearance description in English (color, shape, material, size)",'
    '"usage":"Primary use cases in English",'
    '"selling_points":"Key selling points in English (comma-separated)"}}\n\n'
    "Product info:\nTitle: {title}\nDescription: {description}\n\n"
    "Image analysis results:\n{image_results}\n\n"
    "Return ONLY the JSON, no other text."
)


def analyze_product_images(
    image_paths: list[str],
    vision_model: AIModel,
) -> list[dict]:
    """Run 3-layer AI recognition on each product image.

    Returns list of dicts with keys:
    basic_recognition, product_understanding, creative_usage
    """
    results = []
    for path in image_paths:
        try:
            raw = vision_model.analyze_text(
                PRODUCT_IMAGE_PROMPT,
                task="direct",
            ) if not vision_model.SUPPORTS_VISION else _analyze_single_image(vision_model, path)
            parsed = vision_model._parse_json_safe(raw) if isinstance(raw, str) else raw
            results.append({
                "index": len(results) + 1,
                "filename": Path(path).name,
                "basic_recognition": parsed.get("basic_recognition", ""),
                "product_understanding": parsed.get("product_understanding", ""),
                "creative_usage": parsed.get("creative_usage", ""),
            })
        except Exception as e:
            logger.warning("Image analysis failed for %s: %s", path, e)
            results.append({
                "index": len(results) + 1,
                "filename": Path(path).name,
                "basic_recognition": f"Analysis failed: {e}",
                "product_understanding": "",
                "creative_usage": "",
            })
    return results


def _analyze_single_image(vision_model: AIModel, image_path: str) -> str:
    """Analyze a single image using vision model."""
    import base64
    img_b64 = base64.b64encode(Path(image_path).read_bytes()).decode()
    # Use analyze_frames which handles vision input
    results = vision_model.analyze_frames([image_path])
    if results:
        return json.dumps(results[0], ensure_ascii=False)
    return "{}"


def generate_product_doc(
    title: str,
    description: str,
    image_results: list[dict],
    analysis_model: AIModel,
) -> dict:
    """Generate structured product document using analysis model.

    Returns dict with keys: title, description, appearance, usage, selling_points
    """
    image_text = "\n".join(
        f"Image {r['index']} ({r['filename']}): "
        f"Basic: {r['basic_recognition']} | "
        f"Product: {r['product_understanding']} | "
        f"Creative: {r['creative_usage']}"
        for r in image_results
    )
    prompt = PRODUCT_DOC_PROMPT.format(
        title=title, description=description, image_results=image_text
    )
    raw = analysis_model.analyze_text(prompt, task="direct")
    return analysis_model._parse_json_safe(raw) if isinstance(raw, str) else raw


def write_product_docs(
    product_dir: str,
    product_info: dict,
    image_results: list[dict],
) -> tuple[str, str]:
    """Write Markdown and JSON product documents.

    Returns (md_path, json_path).
    """
    out = Path(product_dir)
    out.mkdir(parents=True, exist_ok=True)

    # JSON doc
    json_doc = {**product_info, "images": image_results}
    json_path = out / "product_doc.json"
    json_path.write_text(json.dumps(json_doc, ensure_ascii=False, indent=2), encoding="utf-8")

    # Markdown doc
    md_lines = [
        f"# {product_info.get('title', 'Unknown Product')}",
        "",
        "## Basic Info",
        f"- **Appearance**: {product_info.get('appearance', '')}",
        f"- **Usage**: {product_info.get('usage', '')}",
        f"- **Selling Points**: {product_info.get('selling_points', '')}",
        "",
        f"## Description",
        product_info.get("description", ""),
        "",
        "## Image Analysis Results",
        "",
    ]
    for r in image_results:
        md_lines.extend([
            f"### Image {r['index']} ({r['filename']})",
            f"- **Basic Recognition**: {r['basic_recognition']}",
            f"- **Product Understanding**: {r['product_understanding']}",
            f"- **Creative Usage**: {r['creative_usage']}",
            "",
        ])

    md_path = out / "product_doc.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    return str(md_path), str(json_path)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/product_analyzer.py
git commit -m "feat: add product analyzer service with 3-layer recognition"
```

---

## Task 5: Prompt Generator Service

**Files:**
- Create: `backend/app/services/prompt_generator.py`
- Create: `backend/tests/test_prompt_generator.py`

- [ ] **Step 1: Write prompt generator test**

```python
# backend/tests/test_prompt_generator.py
from app.services.prompt_generator import TEMPLATES, build_generation_prompt


def test_templates_exist():
    assert "grwm" in TEMPLATES
    assert "unboxing" in TEMPLATES
    assert "comparison" in TEMPLATES


def test_build_generation_prompt_contains_product_info():
    product_doc = {
        "title": "Wireless Earbuds",
        "appearance": "White matte finish, oval charging case",
        "selling_points": "ANC, 40h battery, IPX5",
    }
    prompt = build_generation_prompt(product_doc, "grwm")
    assert "Wireless Earbuds" in prompt
    assert "White matte finish" in prompt
    assert "grwm" in prompt.lower() or "GRWM" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_prompt_generator.py -v`
Expected: FAIL

- [ ] **Step 3: Implement prompt generator**

```python
# backend/app/services/prompt_generator.py
"""Template-based marketing video prompt generator."""
import json
import logging

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

TEMPLATES = {
    "grwm": {
        "name": "TikTok GRWM",
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
        "name": "Unboxing Review",
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
    "comparison": {
        "name": "Comparison Test",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, tripod\n"
            "[Video Style] TikTok side-by-side comparison, fast-paced\n"
            "[Video Music] Energetic electronic beat\n"
            "[Video Effects] Split screen, before/after, text overlay with stats\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
}

VARIANT_PROMPT = (
    "You are an expert TikTok marketing video scriptwriter for cross-border e-commerce.\n\n"
    "Product info:\n{product_json}\n\n"
    "Template style: {template_name}\n"
    "Template structure:\n{template_structure}\n\n"
    "Generate exactly 10 different video prompt variants using the template above.\n"
    "Each variant MUST:\n"
    "- Be written entirely in English\n"
    "- Have a unique hook (first 3 seconds) and unique content approach\n"
    "- Keep the product appearance description consistent\n"
    "- Include all template fields\n\n"
    "Hook variation ideas: surprise unboxing, before/after comparison, "
    "problem-solution, direct showcase, challenge/dare, storytelling, "
    "POV style, duet reaction, tutorial, day-in-life.\n\n"
    "Return a JSON array of 10 objects, each with fields: "
    '"variant_index" (1-10), "hook", "content", "full_prompt".\n'
    "Return ONLY the JSON array, no other text."
)


def build_generation_prompt(product_doc: dict, template_key: str) -> str:
    """Build the prompt that asks the AI to generate 10 variants."""
    template = TEMPLATES.get(template_key, TEMPLATES["grwm"])
    consistency = (
        f"Preserve the exact design, color, and appearance of {product_doc.get('title', 'the product')}: "
        f"{product_doc.get('appearance', 'as shown in reference images')}"
    )
    return VARIANT_PROMPT.format(
        product_json=json.dumps(product_doc, ensure_ascii=False, indent=2),
        template_name=template["name"],
        template_structure=template["structure"].format(
            hook="{unique hook here}",
            content="{unique content here}",
            consistency=consistency,
        ),
    )


def generate_prompt_variants(
    product_doc: dict,
    template_key: str,
    analysis_model: AIModel,
) -> list[dict]:
    """Generate 10 prompt variants using the analysis model.

    Returns list of dicts with keys: variant_index, hook, content, full_prompt
    """
    prompt = build_generation_prompt(product_doc, template_key)
    raw = analysis_model.analyze_text(prompt, task="direct")
    parsed = analysis_model._parse_json_safe(raw)

    if isinstance(parsed, list):
        return parsed

    logger.warning("Prompt generation did not return a list, raw: %s", raw[:200])
    return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_prompt_generator.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/prompt_generator.py backend/tests/test_prompt_generator.py
git commit -m "feat: add prompt generator with 3 preset templates"
```

---

## Task 6: Image 2.0 Integration

**Files:**
- Create: `backend/app/ai_models/image_model.py`

- [ ] **Step 1: Implement Image 2.0 client**

```python
# backend/app/ai_models/image_model.py
"""Image 2.0 (laozhang) API integration for keyframe image generation."""
import base64
import logging
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.laozhang.ai/v1"


class ImageModel:
    """Generate images via laozhang Image 2.0 API."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL, model: str = "gpt-image-2-vip"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate_image(self, prompt: str, size: str = "1536x1024") -> bytes:
        """Generate a single image from prompt. Returns image bytes."""
        url = f"{self.base_url}/images/generations"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {"model": self.model, "prompt": prompt}
        if self.model == "gpt-image-2-vip":
            payload["size"] = size

        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        item = data.get("data", [{}])[0]
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"])
        if item.get("url"):
            img_resp = requests.get(item["url"], timeout=30)
            img_resp.raise_for_status()
            return img_resp.content

        raise RuntimeError("No image data in response")

    def generate_with_reference(self, prompt: str, reference_image_path: str, size: str = "1536x1024") -> bytes:
        """Generate image with a reference product image. Returns image bytes."""
        url = f"{self.base_url}/images/edits"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {"image": open(reference_image_path, "rb")}
        data_fields = {"model": self.model, "prompt": prompt}
        if size:
            data_fields["size"] = size

        resp = requests.post(url, headers=headers, files=files, data=data_fields, timeout=120)
        resp.raise_for_status()
        result = resp.json()

        item = result.get("data", [{}])[0]
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"])
        if item.get("url"):
            img_resp = requests.get(item["url"], timeout=30)
            img_resp.raise_for_status()
            return img_resp.content

        raise RuntimeError("No image data in response")

    def generate_and_save(self, prompt: str, output_path: str, reference_image_path: str | None = None) -> str:
        """Generate image and save to disk. Returns saved file path."""
        if reference_image_path:
            img_bytes = self.generate_with_reference(prompt, reference_image_path)
        else:
            img_bytes = self.generate_image(prompt)

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(img_bytes)
        return str(out)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/ai_models/image_model.py
git commit -m "feat: add Image 2.0 (laozhang) API integration"
```

---

## Task 7: SeedDance 2.0 Integration

**Files:**
- Create: `backend/app/ai_models/seedance_model.py`

- [ ] **Step 1: Implement SeedDance 2.0 client**

```python
# backend/app/ai_models/seedance_model.py
"""SeedDance 2.0 (volcengine) API integration for video generation."""
import logging
import time

import requests

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


class SeedanceModel:
    """Generate videos via SeedDance 2.0 API."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def submit_video_task(
        self,
        prompt: str,
        reference_images: list[str] | None = None,
        duration: int = 5,
        aspect_ratio: str = "9:16",
        resolution: str = "1080p",
    ) -> str:
        """Submit a video generation task. Returns task_id."""
        url = f"{self.base_url}/video/generate"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "seedance-2.0",
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
        }
        if reference_images:
            payload["reference_images"] = reference_images[:9]

        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        task_id = data.get("task_id")
        if not task_id:
            raise RuntimeError(f"No task_id in response: {data}")
        logger.info("SeedDance task submitted: %s", task_id)
        return task_id

    def poll_task(self, task_id: str, max_wait: int = 300, interval: int = 5) -> dict:
        """Poll task status until completion or timeout.

        Returns dict with keys: status, video_url (if succeeded).
        """
        url = f"{self.base_url}/video/status/{task_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        elapsed = 0

        while elapsed < max_wait:
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status", "unknown")

            if status == "succeeded":
                video_url = data.get("result", {}).get("video_url", "")
                logger.info("SeedDance task %s succeeded: %s", task_id, video_url)
                return {"status": "succeeded", "video_url": video_url}
            if status in ("failed", "cancelled"):
                error = data.get("error", "Unknown error")
                logger.error("SeedDance task %s failed: %s", task_id, error)
                return {"status": status, "error": error}

            time.sleep(interval)
            elapsed += interval

        return {"status": "timeout", "error": f"Task {task_id} timed out after {max_wait}s"}

    def generate_video(
        self,
        prompt: str,
        reference_images: list[str] | None = None,
        duration: int = 5,
        aspect_ratio: str = "9:16",
    ) -> dict:
        """Submit task and poll until completion. Returns result dict."""
        task_id = self.submit_video_task(prompt, reference_images, duration, aspect_ratio)
        return self.poll_task(task_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/ai_models/seedance_model.py
git commit -m "feat: add SeedDance 2.0 (volcengine) video generation integration"
```

---

## Task 8: Product Pipeline (Background Tasks)

**Files:**
- Create: `backend/app/tasks/product_pipeline.py`

- [ ] **Step 1: Implement product pipeline**

```python
# backend/app/tasks/product_pipeline.py
"""Background pipeline: scrape → analyze → generate prompts."""
import json
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
from app.models.config import ModelConfig

logger = logging.getLogger(__name__)

# In-memory progress: product_id → {scrape, doc, prompts, error}
_progress: dict[str, dict] = {}


def get_product_progress(product_id: str) -> dict:
    return _progress.get(product_id, {"scrape": 0, "doc": 0, "prompts": 0, "error": None})


def _set_progress(product_id: str, error: str | None = None, **kwargs: int) -> None:
    if product_id not in _progress:
        _progress[product_id] = {"scrape": 0, "doc": 0, "prompts": 0, "error": None}
    _progress[product_id].update(kwargs)
    if error is not None:
        _progress[product_id]["error"] = error


def run_product_pipeline(product_id: str):
    """Full pipeline: scrape → analyze images → generate doc → generate prompts."""
    db: Session = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product:
            return

        product.status = "scraping"
        db.commit()
        _set_progress(product_id, scrape=0, doc=0, prompts=0)

        product_dir = str(Path(settings.products_dir) / product_id)
        images_dir = str(Path(product_dir) / "images")

        # Step 1: Scrape product page
        from app.services.scraper import scrape_product
        scrape_result = scrape_product(product.url, images_dir)
        product.title = scrape_result["title"]
        product.description = scrape_result["description"]
        product.images_dir = images_dir
        db.commit()
        _set_progress(product_id, scrape=100)

        if not scrape_result["image_paths"]:
            raise RuntimeError("No product images found on the page")

        # Step 2: AI image analysis (3-layer)
        product.status = "analyzing"
        db.commit()
        _set_progress(product_id, doc=10)

        from app.ai_models import get_model
        from app.services.product_analyzer import (
            analyze_product_images, generate_product_doc, write_product_docs,
        )

        cfg = db.query(ModelConfig).first() or ModelConfig()
        vision_model = get_model(cfg.vision_model, cfg)
        analysis_model = get_model(cfg.analysis_model, cfg)

        image_results = analyze_product_images(scrape_result["image_paths"], vision_model)
        _set_progress(product_id, doc=60)

        # Step 3: Generate product document
        product_info = generate_product_doc(
            product.title, product.description, image_results, analysis_model,
        )
        md_path, json_path = write_product_docs(product_dir, product_info, image_results)
        product.doc_path = md_path
        product.doc_json_path = json_path
        db.commit()
        _set_progress(product_id, doc=100)

        # Step 4: Generate 10 prompt variants
        _set_progress(product_id, prompts=10)
        from app.services.prompt_generator import generate_prompt_variants

        variants = generate_prompt_variants(product_info, "grwm", analysis_model)
        for v in variants:
            pp = ProductPrompt(
                product_id=product_id,
                template_name="grwm",
                variant_index=v.get("variant_index", 0),
                prompt_text=v.get("full_prompt", ""),
            )
            db.add(pp)
        db.commit()
        _set_progress(product_id, prompts=100)

        product.status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Product pipeline failed for %s: %s", product_id, e)
        try:
            product = db.get(Product, product_id)
            if product:
                product.status = "failed"
                product.error_message = str(e)
                db.commit()
        except Exception:
            pass
        _set_progress(product_id, error=str(e))
    finally:
        db.close()


def generate_image_for_prompt(prompt_id: str):
    """Generate a keyframe image for a single prompt."""
    db: Session = SessionLocal()
    try:
        pp = db.get(ProductPrompt, prompt_id)
        if not pp:
            return
        product = db.get(Product, pp.product_id)
        if not product:
            return

        pp.image_status = "generating"
        db.commit()

        from app.ai_models.image_model import ImageModel
        from app.config import settings

        model = ImageModel(api_key=settings.laozhang_api_key)

        # Use first product image as reference
        images_dir = Path(product.images_dir)
        ref_images = sorted(images_dir.glob("original_*"))
        ref_path = str(ref_images[0]) if ref_images else None

        output_dir = Path(settings.products_dir) / product.id / "generated"
        output_path = str(output_dir / f"prompt_{pp.variant_index}_image.jpg")

        saved = model.generate_and_save(
            prompt=pp.prompt_text,
            output_path=output_path,
            reference_image_path=ref_path,
        )
        pp.image_path = saved
        pp.image_status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Image generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.image_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def generate_video_for_prompt(prompt_id: str):
    """Generate a video for a single prompt using SeedDance 2.0."""
    db: Session = SessionLocal()
    try:
        pp = db.get(ProductPrompt, prompt_id)
        if not pp:
            return
        product = db.get(Product, pp.product_id)
        if not product:
            return

        pp.video_status = "generating"
        db.commit()

        from app.ai_models.seedance_model import SeedanceModel
        from app.config import settings

        model = SeedanceModel(api_key=settings.volcengine_api_key)

        # Collect product image URLs as references
        images_dir = Path(product.images_dir)
        ref_images = [str(p) for p in sorted(images_dir.glob("original_*"))[:9]]

        result = model.generate_video(
            prompt=pp.prompt_text,
            reference_images=ref_images,
            duration=5,
            aspect_ratio="9:16",
        )

        if result["status"] == "succeeded":
            pp.video_url = result.get("video_url", "")
            pp.video_status = "completed"
        else:
            pp.video_status = "failed"

        db.commit()

    except Exception as e:
        logger.exception("Video generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.video_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/tasks/product_pipeline.py
git commit -m "feat: add product pipeline background tasks"
```

---

## Task 9: Product API Routes

**Files:**
- Create: `backend/app/api/products.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Implement product API routes**

```python
# backend/app/api/products.py
"""Product video generation API routes."""
import json
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
from app.schemas.product import ProductCreate, ProductOut, ProductPromptOut, ProductDocOut
from app.tasks.product_pipeline import (
    run_product_pipeline, get_product_progress,
    generate_image_for_prompt, generate_video_for_prompt,
)

router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("/create", response_model=ProductOut)
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    product = Product(url=body.url)
    db.add(product)
    db.commit()
    db.refresh(product)
    threading.Thread(target=run_product_pipeline, args=(product.id,), daemon=True).start()
    return product


@router.get("", response_model=list[ProductOut])
def list_products(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Product).order_by(Product.created_at.desc())
    if status:
        q = q.filter(Product.status == status)
    return q.all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.get("/{product_id}/progress")
def get_progress(product_id: str):
    return get_product_progress(product_id)


@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    # Delete prompts
    db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    # Clean up files
    from app.config import settings
    product_dir = Path(settings.products_dir) / product_id
    if product_dir.exists():
        import shutil
        shutil.rmtree(product_dir, ignore_errors=True)
    return {"ok": True}


@router.get("/{product_id}/doc")
def get_product_doc(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.doc_path:
        raise HTTPException(404, "Product doc not found")
    path = Path(product.doc_path)
    if not path.exists():
        raise HTTPException(404, "Doc file missing")
    return FileResponse(str(path), media_type="text/markdown")


@router.get("/{product_id}/doc/json", response_model=ProductDocOut)
def get_product_doc_json(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.doc_json_path:
        raise HTTPException(404, "Product JSON doc not found")
    path = Path(product.doc_json_path)
    if not path.exists():
        raise HTTPException(404, "JSON doc file missing")
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


@router.get("/{product_id}/images/{filename}")
def get_product_image(product_id: str, filename: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.images_dir:
        raise HTTPException(404, "Product not found")
    path = Path(product.images_dir) / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(path))


# --- Prompt routes ---

@router.get("/{product_id}/prompts", response_model=list[ProductPromptOut])
def list_prompts(product_id: str, db: Session = Depends(get_db)):
    return (
        db.query(ProductPrompt)
        .filter(ProductPrompt.product_id == product_id)
        .order_by(ProductPrompt.variant_index)
        .all()
    )


@router.post("/prompts/{prompt_id}/generate-image")
def trigger_image_generation(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    threading.Thread(target=generate_image_for_prompt, args=(prompt_id,), daemon=True).start()
    return {"ok": True, "prompt_id": prompt_id}


@router.get("/prompts/{prompt_id}/image")
def get_generated_image(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp or not pp.image_path:
        raise HTTPException(404, "Generated image not found")
    path = Path(pp.image_path)
    if not path.exists():
        raise HTTPException(404, "Image file missing")
    return FileResponse(str(path))


@router.post("/prompts/{prompt_id}/generate-video")
def trigger_video_generation(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    threading.Thread(target=generate_video_for_prompt, args=(prompt_id,), daemon=True).start()
    return {"ok": True, "prompt_id": prompt_id}


@router.get("/prompts/{prompt_id}/video")
def get_generated_video(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp or not pp.video_url:
        raise HTTPException(404, "Generated video not found")
    return {"video_url": pp.video_url, "status": pp.video_status}
```

- [ ] **Step 2: Register router in main.py**

In `backend/main.py`, add:

```python
from app.api.products import router as products_router
app.include_router(products_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/products.py backend/main.py
git commit -m "feat: add product API routes"
```

---

## Task 10: Frontend Types + API Client

**Files:**
- Create: `frontend/src/types/product.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Create TypeScript types**

```typescript
// frontend/src/types/product.ts
export interface Product {
  id: string
  url: string
  title: string
  description: string
  status: 'pending' | 'scraping' | 'analyzing' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface ProductPrompt {
  id: string
  product_id: string
  template_name: string
  variant_index: number
  prompt_text: string
  image_url: string | null
  image_status: 'pending' | 'generating' | 'completed' | 'failed'
  video_url: string | null
  video_status: 'pending' | 'generating' | 'completed' | 'failed'
  created_at: string
}

export interface ProductProgress {
  scrape: number
  doc: number
  prompts: number
  error: string | null
}

export interface ProductDoc {
  title: string
  description: string
  appearance: string
  usage: string
  selling_points: string
  images: Array<{
    index: number
    filename: string
    basic_recognition: string
    product_understanding: string
    creative_usage: string
  }>
}
```

- [ ] **Step 2: Add product API functions to client.ts**

Append to `frontend/src/api/client.ts`:

```typescript
import type { Product, ProductPrompt, ProductProgress, ProductDoc } from '../types/product'

export const createProduct = (url: string) =>
  api.post<Product>('/products/create', { url }).then(r => r.data)

export const getProducts = (status?: string) =>
  api.get<Product[]>('/products', { params: status ? { status } : {} }).then(r => r.data)

export const getProduct = (id: string) =>
  api.get<Product>(`/products/${id}`).then(r => r.data)

export const getProductProgress = (id: string) =>
  api.get<ProductProgress>(`/products/${id}/progress`).then(r => r.data)

export const deleteProduct = (id: string) =>
  api.delete(`/products/${id}`).then(r => r.data)

export const getProductDocJson = (id: string) =>
  api.get<ProductDoc>(`/products/${id}/doc/json`).then(r => r.data)

export const getProductPrompts = (id: string) =>
  api.get<ProductPrompt[]>(`/products/${id}/prompts`).then(r => r.data)

export const triggerImageGeneration = (promptId: string) =>
  api.post(`/products/prompts/${promptId}/generate-image`).then(r => r.data)

export const triggerVideoGeneration = (promptId: string) =>
  api.post(`/products/prompts/${promptId}/generate-video`).then(r => r.data)

export const getProductImageUrl = (productId: string, filename: string) =>
  `${API_BASE}/products/${productId}/images/${filename}`

export const getGeneratedImageUrl = (promptId: string) =>
  `${API_BASE}/products/prompts/${promptId}/image`
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/product.ts frontend/src/api/client.ts
git commit -m "feat: add product TypeScript types and API client"
```

---

## Task 11: Frontend ProductPage

**Files:**
- Create: `frontend/src/pages/ProductPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create ProductPage component**

Create `frontend/src/pages/ProductPage.tsx` with:
- URL input + "Start Analysis" button
- Kanban-style pipeline cards (5 steps: Scrape/Doc/Prompts/Image/Video)
- Product info section (image grid + doc preview)
- Prompt list section (10 cards with copy/generate buttons)
- Polling for progress updates during pipeline execution
- Manual trigger buttons for image/video generation

Key implementation details:
- Use `useState` for product state, prompts, progress
- Use `useEffect` with polling interval (2s) when status is processing
- Pipeline cards show: completed (green), in-progress (blue with progress bar), pending (gray with manual trigger button), failed (red with error)
- Product images displayed in 3-column grid, dynamic count
- Each prompt card has: copy button, generate image button, generate video button
- Status badges on prompt cards for image/video generation status

- [ ] **Step 2: Add route in App.tsx**

In `frontend/src/App.tsx`, add:

```tsx
import ProductPage from './pages/ProductPage'

// Inside Routes:
<Route path="/product" element={<ProductPage />} />
<Route path="/product/:id" element={<ProductPage />} />
```

- [ ] **Step 3: Add nav link in Sidebar**

In `frontend/src/components/layout/Sidebar.tsx`, add a navigation link for "Product Video" pointing to `/product`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProductPage.tsx frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add ProductPage with kanban pipeline UI"
```

---

## Task 12: Integration Test + Config Page Update

**Files:**
- Create: `backend/tests/test_product_api.py`
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Write API integration test**

```python
# backend/tests/test_product_api.py
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.database import Base, engine
from backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_create_product():
    with patch("app.api.products.threading") as mock_thread:
        resp = client.post("/api/products/create", json={"url": "https://example.com/product"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://example.com/product"
        assert data["status"] == "pending"
        assert "id" in data


def test_list_products():
    with patch("app.api.products.threading"):
        client.post("/api/products/create", json={"url": "https://example.com/p1"})
        client.post("/api/products/create", json={"url": "https://example.com/p2"})
    resp = client.get("/api/products")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_delete_product():
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.delete(f"/api/products/{pid}")
    assert resp.status_code == 200
    get_resp = client.get(f"/api/products/{pid}")
    assert get_resp.status_code == 404
```

- [ ] **Step 2: Update ConfigPage to show image_model and video_gen_model**

In `frontend/src/pages/ConfigPage.tsx`, add two new model selector sections for:
- Image Generation Model (default: laozhang-image-2-vip)
- Video Generation Model (default: seedance-2.0)

With corresponding API key input fields for `laozhang_api_key` and `volcengine_api_key`.

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_product_api.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_product_api.py frontend/src/pages/ConfigPage.tsx
git commit -m "feat: add product API tests and config page update"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All MVP requirements covered (scraping, 3-layer recognition, doc generation, prompt generation, Image 2.0, SeedDance 2.0, kanban UI, model config extension)
- [x] **Placeholder scan**: No TBD/TODO/placeholder text in any task
- [x] **Type consistency**: `Product`, `ProductPrompt`, `ProductOut`, `ProductPromptOut` used consistently across models, schemas, API, and frontend types
- [x] **Language constraint**: All prompts and templates generate English output for cross-border e-commerce
- [x] **Model usage**: Vision model for image recognition, analysis model for doc/prompt generation, Image 2.0 for keyframe images, SeedDance 2.0 for videos
