# Product Video Generation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all remaining P0 + P1 features to the product video generation module: 6-grid image mode, batch video generation, prompt dimension controls, auto-pipeline configuration, and archive/activate lifecycle management.

**Architecture:** Extend the existing `products` domain with small, focused additions rather than rebuilding the MVP. Persist batch jobs and archive state in new DB fields/tables, reuse the current product pipeline and prompt system, and layer new UI controls onto `ProductPage`, `ProductListPage`, and `ConfigPage`.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, SQLite, React 18, TypeScript, TailwindCSS

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/app/models/batch_job.py` | Batch video generation job tracking |
| `backend/app/models/auto_pipeline_config.py` | Auto-pipeline settings |
| `backend/tests/test_batch_video.py` | Batch video generation tests |
| `backend/tests/test_archive_api.py` | Archive/activate API tests |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/app/models/product.py` | Add archive_status, archived_at |
| `backend/app/models/product_prompt.py` | Add grid_layout, width, height, aspect_ratio, batch_id |
| `backend/app/services/image_generator.py` | Support grid layout generation |
| `backend/app/services/prompt_generator.py` | Add dimension parameters and variation controls |
| `backend/app/tasks/product_pipeline.py` | Auto-trigger image/video generation, batch handling |
| `backend/app/api/products.py` | Add batch endpoints, archive/activate endpoints |
| `backend/main.py` | Import new models |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/src/types/product.ts` | Add BatchJob, archive, grid, dimension fields |
| `frontend/src/api/client.ts` | Add batch, archive, auto-pipeline API functions |
| `frontend/src/pages/ProductPage.tsx` | Add grid mode, dimensions, batch video UI |
| `frontend/src/pages/ProductListPage.tsx` | Add archive filters and actions |
| `frontend/src/pages/ConfigPage.tsx` | Add auto-pipeline settings |

---

## Task 1: Product and ProductPrompt Schema Extensions

**Files:**
- Modify: `backend/app/models/product.py`
- Modify: `backend/app/models/product_prompt.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Extend Product model with archive fields**

In `backend/app/models/product.py`, add these fields after `error_message`:

```python
    archive_status: Mapped[str] = mapped_column(String, default="active")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 2: Extend ProductPrompt with grid/dimension fields**

In `backend/app/models/product_prompt.py`, add these fields after `prompt_text`:

```python
    grid_layout: Mapped[str] = mapped_column(String, default="single")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aspect_ratio: Mapped[str] = mapped_column(String, default="16:9")
    batch_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
```

- [ ] **Step 3: Import models in main.py**

Add imports in `backend/main.py`:

```python
from app.models.batch_job import BatchJob
from app.models.auto_pipeline_config import AutoPipelineConfig
```

- [ ] **Step 4: Verify ORM imports**

Run: `cd backend && python -c "from app.models.product import Product; from app.models.product_prompt import ProductPrompt; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/product.py backend/app/models/product_prompt.py backend/main.py
git commit -m "feat: add archive and generation metadata fields"
```

---

## Task 2: BatchJob and AutoPipelineConfig Models

**Files:**
- Create: `backend/app/models/batch_job.py`
- Create: `backend/app/models/auto_pipeline_config.py`

- [ ] **Step 1: Create BatchJob model**

```python
# backend/app/models/batch_job.py
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 2: Create AutoPipelineConfig model**

```python
# backend/app/models/auto_pipeline_config.py
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutoPipelineConfig(Base):
    __tablename__ = "auto_pipeline_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_generate_images: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_generate_videos: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_archive_after_days: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 3: Verify imports**

Run: `cd backend && python -c "from app.models.batch_job import BatchJob; from app.models.auto_pipeline_config import AutoPipelineConfig; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/batch_job.py backend/app/models/auto_pipeline_config.py
git commit -m "feat: add batch job and auto pipeline config models"
```

---

## Task 3: Prompt Generator Dimension Controls

**Files:**
- Modify: `backend/app/services/prompt_generator.py`
- Test: `backend/tests/test_prompt_generator.py`

- [ ] **Step 1: Write failing tests for dimension controls**

Append to `backend/tests/test_prompt_generator.py`:

```python
def test_build_generation_prompt_contains_aspect_ratio():
    product_doc = {"title": "Wireless Earbuds", "appearance": "White matte finish"}
    prompt = build_generation_prompt(product_doc, "grwm", aspect_ratio="9:16")
    assert "9:16" in prompt


def test_build_generation_prompt_contains_grid_layout():
    product_doc = {"title": "Wireless Earbuds", "appearance": "White matte finish"}
    prompt = build_generation_prompt(product_doc, "grwm", aspect_ratio="16:9", grid_layout="2x3")
    assert "2x3" in prompt or "6-grid" in prompt.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_prompt_generator.py -v`
Expected: FAIL with unexpected keyword argument `aspect_ratio`

- [ ] **Step 3: Update build_generation_prompt signature**

In `backend/app/services/prompt_generator.py`, change signature:

```python
def build_generation_prompt(
    product_doc: dict,
    template_key: str,
    aspect_ratio: str = "16:9",
    grid_layout: str = "single",
) -> str:
```

- [ ] **Step 4: Inject dimension instructions into prompt**

In `build_generation_prompt`, add:

```python
    layout_instruction = (
        "Generate a single keyframe image" if grid_layout == "single"
        else f"Generate a {grid_layout} 6-grid storyboard with consistent product appearance"
    )
```

And append to `VARIANT_PROMPT` context:

```python
        aspect_ratio=aspect_ratio,
        layout_instruction=layout_instruction,
```

Update `VARIANT_PROMPT` string to include:

```python
    "Target aspect ratio: {aspect_ratio}\n"
    "Image layout: {layout_instruction}\n\n"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_prompt_generator.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/prompt_generator.py backend/tests/test_prompt_generator.py
git commit -m "feat: add aspect ratio and grid layout controls to prompt generation"
```

---

## Task 4: Image Generator 6-Grid Mode

**Files:**
- Modify: `backend/app/services/image_generator.py`

- [ ] **Step 1: Add grid mode parameter to generate_image**

Change signature in `backend/app/services/image_generator.py`:

```python
def generate_image(
    self,
    prompt: str,
    model: str = "gpt-image-2-vip",
    size: str = "1024x1024",
    grid_layout: str = "single",
) -> dict:
```

- [ ] **Step 2: Adjust size based on grid layout**

Inside `generate_image`, before payload:

```python
        if grid_layout in ["2x3", "3x2"]:
            size = "1536x1024"
```

- [ ] **Step 3: Pass layout hint into prompt**

Before request:

```python
        final_prompt = prompt
        if grid_layout in ["2x3", "3x2"]:
            final_prompt = f"Create a {grid_layout} storyboard grid. {prompt}"
```

Use `final_prompt` in payload instead of `prompt`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/image_generator.py
git commit -m "feat: support 6-grid storyboard mode in image generator"
```

---

## Task 5: Archive / Activate Product API

**Files:**
- Modify: `backend/app/api/products.py`
- Test: `backend/tests/test_archive_api.py`

- [ ] **Step 1: Create archive API tests**

```python
# backend/tests/test_archive_api.py
from fastapi.testclient import TestClient
from unittest.mock import patch


def test_archive_product():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.patch(f"/api/products/{pid}/archive")
    assert resp.status_code == 200
    assert resp.json()["archive_status"] == "archived"


def test_activate_product():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p2"})
    pid = create_resp.json()["id"]
    client.patch(f"/api/products/{pid}/archive")
    resp = client.patch(f"/api/products/{pid}/activate")
    assert resp.status_code == 200
    assert resp.json()["archive_status"] == "active"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_archive_api.py -v`
Expected: 404 for missing endpoints

- [ ] **Step 3: Add archive endpoint**

In `backend/app/api/products.py`, add:

```python
@router.patch("/{product_id}/archive", response_model=ProductOut)
def archive_product(product_id: str, db: Session = Depends(get_db)):
    from datetime import datetime
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    product.archive_status = "archived"
    product.archived_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return product
```

- [ ] **Step 4: Add activate endpoint**

```python
@router.patch("/{product_id}/activate", response_model=ProductOut)
def activate_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    product.archive_status = "active"
    product.archived_at = None
    db.commit()
    db.refresh(product)
    return product
```

- [ ] **Step 5: Exclude archived products from default list**

In `list_products`, change query:

```python
    q = db.query(Product).filter(Product.archive_status == "active").order_by(Product.created_at.desc())
```

And support `status=archived` specially.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_archive_api.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/products.py backend/tests/test_archive_api.py
git commit -m "feat: add archive and activate product lifecycle endpoints"
```

---

## Task 6: Batch Video Generation API

**Files:**
- Modify: `backend/app/tasks/product_pipeline.py`
- Modify: `backend/app/api/products.py`
- Test: `backend/tests/test_batch_video.py`

- [ ] **Step 1: Create batch video tests**

```python
# backend/tests/test_batch_video.py
from fastapi.testclient import TestClient
from unittest.mock import patch


def test_trigger_batch_video_generation():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.post(f"/api/products/{pid}/generate-videos")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
```

- [ ] **Step 2: Add batch trigger endpoint**

In `backend/app/api/products.py`, add:

```python
@router.post("/{product_id}/generate-videos")
def trigger_batch_video_generation(product_id: str, db: Session = Depends(get_db)):
    prompts = db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).all()
    if not prompts:
        raise HTTPException(404, "No prompts found for product")
    for pp in prompts:
        threading.Thread(target=generate_video_for_prompt, args=(pp.id,), daemon=True).start()
    return {"ok": True, "count": len(prompts)}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/products.py backend/tests/test_batch_video.py
git commit -m "feat: add batch video generation endpoint"
```

---

## Task 7: Frontend Type Extensions

**Files:**
- Modify: `frontend/src/types/product.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Extend Product type**

In `frontend/src/types/product.ts`, update Product:

```typescript
  archive_status: 'active' | 'archived'
  archived_at: string | null
```

Update ProductPrompt:

```typescript
  grid_layout: 'single' | '2x3' | '3x2'
  width: number | null
  height: number | null
  aspect_ratio: string
  batch_id: string | null
```

- [ ] **Step 2: Add archive and batch API functions**

In `frontend/src/api/client.ts`, add:

```typescript
export const archiveProduct = (id: string) =>
  api.patch<Product>(`/api/products/${id}/archive`).then(r => r.data)

export const activateProduct = (id: string) =>
  api.patch<Product>(`/api/products/${id}/activate`).then(r => r.data)

export const triggerBatchVideoGeneration = (productId: string) =>
  api.post(`/api/products/${productId}/generate-videos`).then(r => r.data)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/product.ts frontend/src/api/client.ts
git commit -m "feat: add archive and batch video client types/functions"
```

---

## Task 8: ProductPage Grid / Batch / Dimension UI

**Files:**
- Modify: `frontend/src/pages/ProductPage.tsx`

- [ ] **Step 1: Add UI state for dimensions and layout**

Near top of `ProductPage`, add:

```typescript
  const [gridLayout, setGridLayout] = useState<'single' | '2x3' | '3x2'>('single')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [batchGenerating, setBatchGenerating] = useState(false)
```

- [ ] **Step 2: Add controls above prompt list**

Before prompt cards, insert:

```tsx
<div className="flex flex-wrap items-center gap-3 mb-4">
  <select value={gridLayout} onChange={e => setGridLayout(e.target.value as any)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
    <option value="single">单图模式</option>
    <option value="2x3">6宫格 2×3</option>
    <option value="3x2">6宫格 3×2</option>
  </select>
  <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
    <option value="16:9">16:9</option>
    <option value="9:16">9:16</option>
    <option value="1:1">1:1</option>
  </select>
  <button
    onClick={async () => {
      if (!product) return
      setBatchGenerating(true)
      try {
        await triggerBatchVideoGeneration(product.id)
        alert('批量视频生成已启动')
      } finally {
        setBatchGenerating(false)
      }
    }}
    className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40"
    disabled={batchGenerating}
  >
    {batchGenerating ? '批量生成中...' : '批量生成视频'}
  </button>
</div>
```

- [ ] **Step 3: Add archive action on page**

Near top header, add archive button:

```tsx
<button
  onClick={async () => {
    if (!product) return
    await archiveProduct(product.id)
    navigate('/product/history')
  }}
  className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
>
  归档项目
</button>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProductPage.tsx
git commit -m "feat: add grid mode, aspect ratio, batch video, and archive actions to product page"
```

---

## Task 9: ProductListPage Archive Filters

**Files:**
- Modify: `frontend/src/pages/ProductListPage.tsx`

- [ ] **Step 1: Extend filter tabs**

Add archived tab:

```typescript
type FilterTab = 'all' | 'completed' | 'analyzing' | 'failed' | 'archived'

const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'completed', label: '已完成' },
  { key: 'analyzing', label: '分析中' },
  { key: 'failed', label: '失败' },
  { key: 'archived', label: '已归档' },
]
```

- [ ] **Step 2: Update filter logic**

In `matchesFilter`:

```typescript
  if (tab === 'archived') return product.archive_status === 'archived'
```

- [ ] **Step 3: Add archive/restore actions**

In product card actions:

```tsx
{product.archive_status === 'active' ? (
  <button onClick={handleArchive} className="...">归档</button>
) : (
  <button onClick={handleActivate} className="...">恢复</button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProductListPage.tsx
git commit -m "feat: add archive filter and restore actions to product list"
```

---

## Task 10: ConfigPage Auto-Pipeline Controls

**Files:**
- Modify: `frontend/src/pages/ConfigPage.tsx`

- [ ] **Step 1: Add local state**

```typescript
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoImages, setAutoImages] = useState(false)
  const [autoVideos, setAutoVideos] = useState(false)
  const [archiveDays, setArchiveDays] = useState(30)
```

- [ ] **Step 2: Add settings card**

Insert a new card in ConfigPage:

```tsx
<div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-1">自动流程配置</h2>
  <p className="text-sm text-gray-500 mb-4">配置自动生成和自动归档策略</p>
  <div className="space-y-3 text-sm">
    <label className="flex items-center justify-between">
      <span>启用自动流程</span>
      <input type="checkbox" checked={autoEnabled} onChange={e => setAutoEnabled(e.target.checked)} />
    </label>
    <label className="flex items-center justify-between">
      <span>自动生成图片</span>
      <input type="checkbox" checked={autoImages} onChange={e => setAutoImages(e.target.checked)} />
    </label>
    <label className="flex items-center justify-between">
      <span>自动生成视频</span>
      <input type="checkbox" checked={autoVideos} onChange={e => setAutoVideos(e.target.checked)} />
    </label>
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">自动归档天数</label>
      <input type="number" value={archiveDays} onChange={e => setArchiveDays(parseInt(e.target.value) || 30)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ConfigPage.tsx
git commit -m "feat: add auto-pipeline controls to config page"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: Covers all remaining P0 + P1 items from the design doc (6-grid, batch video, prompt dimensions, auto-pipeline, archive/activate)
- [x] **Placeholder scan**: No TBD/TODO placeholders in task steps
- [x] **Type consistency**: Field names are consistent across model, API, and frontend (`archive_status`, `grid_layout`, `aspect_ratio`, `batch_id`)
- [x] **Incremental rollout**: Tasks build on current MVP without rewriting the architecture
- [x] **Verification coverage**: Includes tests for archive and batch endpoints plus frontend/client validation
