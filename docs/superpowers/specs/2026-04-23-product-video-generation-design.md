# 产品视频生成功能 - 设计文档

**日期**: 2026-04-23  
**方案**: MVP 快速验证  
**预计交付**: 2-3 周

---

## 1. 功能概述

在现有 ViralLens（TikTok 爆款视频拆解系统）基础上，新增"产品视频生成"模块。用户输入产品网址，系统自动：
1. 抓取产品图片和信息
2. 生成产品说明文档（含 AI 三层识别）
3. 生成 10 个营销视频 prompt 变体
4. 调用 Image 2.0 生成关键帧图片
5. 调用 SeedDance 2.0 生成营销视频

核心价值：从产品页面到营销视频的一站式自动化生成。

---

## 2. 设计决策总结

基于用户访谈，确认了 15 个关键设计决策：

1. **产品网址支持范围**: 全支持各种页面（电商/独立站/任意网页）
2. **素材管理方式**: 每个产品网址一个独立项目
3. **Prompt 模板**: 用户可自定义 + 系统预置 3 个模板
4. **图片生成模式**: 用户可任意切换（6宫格/单张），系统自动适配
5. **视频生成触发**: 支持单个和批量生成
6. **自动化终点**: 用户可配置，每步可手动触发
7. **模型配置**: 新增两组（图片生成 + 视频生成），共四组
8. **流程节点 UI**: 看板式卡片
9. **SeedDance 2.0**: 参考图通过 `reference_images` 参数传递
10. **Image 2.0**: 三种线路，支持参考图，同步返回
11. **产品文档**: Markdown + JSON 双格式
12. **项目生命周期**: 支持归档/激活
13. **第一版边界**: 公开页主链路 + 登录态/强反爬作为实验性支持
14. **Prompt 差异维度**: 用户可勾选（场景/hook/人物/镜头）
15. **图片识别粒度**: 三层（基础识别 + 商品理解 + 视频创意用途）

**MVP 范围调整**：
- ✅ 实现：1-3, 7-11, 13, 15
- ⏸️ 暂不实现：4（只做单图）, 5（只做单个生成）, 6（固定流程）, 12（不做归档）, 14（不做差异维度勾选）

---

## 3. 整体架构

### 3.1 数据流

```
产品网址输入
    ↓
通用爬虫（BeautifulSoup + Jina + 结构化数据提取）
    ↓
图片下载 + AI 三层识别（复用现有视觉分析模型）
    ↓
产品文档生成（Markdown + JSON）
    ↓
Prompt 生成器（3 个预置模板 × 10 个变体）
    ↓
Image 2.0 单图生成（关键帧图片）
    ↓
SeedDance 2.0 视频生成（参考图 + prompt）
```

### 3.2 新增后端模块

```
backend/app/
├── api/
│   └── products.py              # 产品相关 API 路由
├── models/
│   ├── product.py               # Product 数据模型
│   └── product_prompt.py        # ProductPrompt 数据模型
├── services/
│   ├── scraper.py               # 网页爬虫服务
│   ├── product_analyzer.py      # 产品图片识别 + 文档生成
│   └── prompt_generator.py      # Prompt 变体生成器
├── ai_models/
│   ├── image_model.py           # Image 2.0 集成
│   └── seedance_model.py        # SeedDance 2.0 集成
└── tasks/
    └── product_pipeline.py      # 产品流水线异步任务
```

### 3.3 新增前端页面

```
frontend/src/pages/
└── ProductPage.tsx              # 产品视频生成主页面
```

---

## 4. 数据模型设计

### 4.1 Product 表（新增）

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| url | str | 产品网址 |
| title | str | 产品标题 |
| description | text | 产品描述 |
| images_dir | str | 图片存储目录路径 |
| doc_path | str | Markdown 文档路径 |
| doc_json_path | str | JSON 文档路径 |
| status | str | pending/scraping/analyzing/completed/failed |
| error_message | text | 失败原因 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 4.2 ProductPrompt 表（新增）

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| product_id | UUID | 关联 Product |
| template_name | str | 使用的模板名称 |
| variant_index | int | 变体序号 1-10 |
| prompt_text | text | 生成的 prompt 内容 |
| image_url | str | Image 2.0 生成的图片 URL，可为空 |
| image_status | str | pending/generating/completed/failed |
| video_url | str | SeedDance 2.0 生成的视频 URL，可为空 |
| video_status | str | pending/generating/completed/failed |
| created_at | datetime | 创建时间 |

### 4.3 ModelConfig 表（扩展现有）

在现有字段基础上新增：
- `image_model`: str (图片生成模型: laozhang-image-2)
- `video_gen_model`: str (视频生成模型: seedance-2.0)

### 4.4 文件存储结构

```
backend/products/
├── {product_id}/
│   ├── images/
│   │   ├── original_1.jpg
│   │   ├── original_2.jpg
│   │   └── ...
│   ├── generated/
│   │   ├── prompt_1_image.jpg
│   │   ├── prompt_2_image.jpg
│   │   └── ...
│   ├── videos/
│   │   ├── prompt_1_video.mp4
│   │   └── ...
│   ├── product_doc.md
│   └── product_doc.json
```

---

## 5. API 接口设计

### 5.1 产品管理接口

```
POST   /api/products/create          # 创建产品项目（输入网址）
GET    /api/products/{id}            # 获取产品详情
GET    /api/products                 # 获取产品列表（支持 status 过滤）
DELETE /api/products/{id}            # 删除产品
```

### 5.2 产品文档接口

```
GET    /api/products/{id}/doc        # 获取 Markdown 文档
GET    /api/products/{id}/doc/json   # 获取 JSON 文档
GET    /api/products/{id}/images/{filename}  # 获取原始图片
```

### 5.3 Prompt 管理接口

```
POST   /api/products/{id}/prompts/generate    # 生成 10 个 prompt 变体
GET    /api/products/{id}/prompts             # 获取所有 prompts
GET    /api/prompts/{prompt_id}               # 获取单个 prompt 详情
```

### 5.4 图片生成接口

```
POST   /api/prompts/{prompt_id}/generate-image   # 为指定 prompt 生成图片
GET    /api/prompts/{prompt_id}/image            # 获取生成的图片
```

### 5.5 视频生成接口

```
POST   /api/prompts/{prompt_id}/generate-video   # 为指定 prompt 生成视频
GET    /api/prompts/{prompt_id}/video            # 获取生成的视频
```

### 5.6 模型配置接口（扩展现有）

```
GET    /api/config/models            # 获取所有模型配置
PATCH  /api/config/models            # 更新模型配置
```

---

## 6. 核心服务设计

### 6.1 网页爬虫服务 (scraper.py)

**职责**: 从产品网址提取图片和信息

**实现策略**:
1. **结构化数据提取**: 优先提取 JSON-LD、Open Graph、Schema.org
2. **通用 HTML 解析**: BeautifulSoup 提取 `<img>` 标签、标题、描述
3. **Jina 预处理**: 对文章类页面使用 Jina 转 Markdown，节省 token
4. **实验性 CDP 支持**: 对登录态/强反爬页面，提供 CDP 浏览器模式（标记为实验性）

**输出**:
- 产品标题
- 产品描述
- 图片 URL 列表（去重）
- 下载的图片文件路径列表

### 6.2 产品分析服务 (product_analyzer.py)

**职责**: 对下载的图片进行 AI 三层识别，生成产品文档

**三层识别**:
1. **基础识别**: 图片内容、颜色、材质、场景
2. **商品理解**: 外观、细节、卖点线索、适合人群、使用场景
3. **视频创意用途**: 适合作为哪类视频镜头/卖点素材

**实现**:
- 复用现有 `vision_model`（视觉分析模型）
- 为每张图片生成三层识别结果
- 生成 Markdown 文档（人类可读）
- 生成 JSON 文档（AI 可用）

**Markdown 文档结构**:
```markdown
# {产品标题}

## 基本信息
- **外观**: ...
- **用途**: ...
- **卖点**: ...

## 图片识别结果

### 图片 1
- **基础识别**: ...
- **商品理解**: ...
- **创意用途**: ...

### 图片 2
...
```

**JSON 文档结构**:
```json
{
  "title": "...",
  "description": "...",
  "appearance": "...",
  "usage": "...",
  "selling_points": "...",
  "images": [
    {
      "index": 1,
      "filename": "original_1.jpg",
      "basic_recognition": "...",
      "product_understanding": "...",
      "creative_usage": "..."
    }
  ]
}
```

### 6.3 Prompt 生成器 (prompt_generator.py)

**职责**: 基于产品文档和模板，生成 10 个 prompt 变体

**预置模板**:
1. **TikTok GRWM** (Get Ready With Me)
2. **开箱测评** (Unboxing Review)
3. **对比评测** (Comparison Test)

**模板结构**:
```python
TEMPLATE_GRWM = """
[Equipment] Shot with iPhone front camera
[Video Style] TikTok GRWM, casual influencer style
[Video Music] Upbeat trending pop
[Video Effects] Jump cuts, outfit transition, text overlay
[First 3 Seconds Hook] {hook}
[Video Content] {content}
[Product Consistency] Preserve the exact design, color, pattern, fabric, and cut of {product_name} throughout the entire video
"""
```

**变体生成策略**:
- 10 个变体主要在 `{hook}` 和 `{content}` 上变化
- Hook 变化：惊喜开箱 / 对比前后 / 问题引入 / 直接展示
- Content 变化：场景、镜头角度、展示方式

**Prompt 中的产品图片引用**:
- Prompt 本身是纯文本，不直接嵌入图片
- 产品图片通过 Image 2.0 的 `/v1/images/edits` 接口作为参考图上传
- 产品图片通过 SeedDance 2.0 的 `reference_images` 参数传递
- Prompt 中用文字描述产品外观（从产品 JSON 文档中提取），确保生成结果与产品一致
- `[Product Consistency]` 字段引用产品文档中的外观描述，而非图片文件路径

**实现**:
- 调用 `analysis_model`（综合分析模型）
- 输入：产品 JSON 文档 + 模板
- 输出：10 个完整的英文 prompt

### 6.4 Image 2.0 集成 (image_model.py)

**API 配置**:
- Base URL: `https://api.laozhang.ai/v1`
- 模型选择: `gpt-image-2-vip`（支持 size 参数）
- 默认尺寸: `1536x1024`

**调用方式**:
```python
def generate_image(prompt: str, reference_images: list[str]) -> str:
    """
    生成单张关键帧图片
    
    Args:
        prompt: 视频 prompt
        reference_images: 产品图片路径列表（作为参考图）
    
    Returns:
        生成的图片 URL 或 base64
    """
```

**参考图处理**:
- 使用 `/v1/images/edits` 接口
- Multipart 上传产品图片
- Prompt 中描述关键帧场景

### 6.5 SeedDance 2.0 集成 (seedance_model.py)

**API 配置**:
- Base URL: `https://ark.cn-beijing.volces.com/api/v3/video/generate`
- 模型: `seedance-2.0`

**调用方式**:
```python
def generate_video(
    prompt: str,
    reference_images: list[str],
    duration: int = 5,
    aspect_ratio: str = "9:16"
) -> str:
    """
    生成营销视频
    
    Args:
        prompt: 视频 prompt
        reference_images: 产品图片 URL 列表（最多 9 张）
        duration: 视频时长（秒）
        aspect_ratio: 画面比例
    
    Returns:
        任务 ID（需轮询获取结果）
    """
```

**参考图传递**:
- 通过 `reference_images` 参数传递（数组）
- 参考图影响：视觉风格、主体对象外观、构图布局
- Prompt 专注描述：动作、运镜、场景氛围

**异步任务处理**:
- 提交任务后返回 `task_id`
- 轮询 `/api/v3/video/status/{task_id}` 获取状态
- 完成后获取 `video_url`

---

## 7. 前端 UI 设计

### 7.1 页面布局

**ProductPage 主页面结构**:
1. **顶部输入区**: 产品网址输入框 + "开始分析"按钮
2. **流程看板**: 5 个看板式卡片（采集/文档/Prompt/图片/视频）
3. **产品信息区**: 产品图片网格 + 文档预览
4. **Prompt 列表区**: 10 个 prompt 卡片 + 操作按钮

### 7.2 看板式流程卡片

**5 个步骤**:
1. **素材采集** 📦 - 显示下载的图片数量
2. **产品文档** 📄 - 显示文档生成状态
3. **Prompt 生成** ✍️ - 显示生成进度（X/10）
4. **图片生成** 🖼️ - 显示图片生成状态
5. **视频生成** 🎬 - 显示视频生成状态

**卡片状态**:
- 已完成：绿色背景，显示耗时
- 进行中：蓝色背景，显示进度条
- 等待中：灰色背景，显示"手动触发"按钮
- 失败：红色背景，显示错误信息

### 7.3 产品信息区

**左侧：产品图片网格**
- 动态数量显示（右上角"共 X 张"）
- 3 列网格布局
- 每张图片右上角有编号
- 点击图片查看大图

**右侧：产品文档预览**
- 显示产品标题、外观、用途、卖点
- 显示图片识别结果（可滚动）
- 操作按钮：查看 MD、下载 JSON

### 7.4 Prompt 列表区

**Prompt 卡片**:
- 序号 + 模板名称 + 变体描述
- Prompt 预览（前 100 字）
- 操作按钮：复制 / 生成图片 / 生成视频
- 状态标识：pending / generating / completed / failed

**批量操作**:
- 全部复制按钮
- 批量生成图片按钮（MVP 暂不实现）

---

## 8. 异步任务流程

### 8.1 产品流水线 (product_pipeline.py)

**任务编排**:
```python
async def run_product_pipeline(product_id: UUID):
    """产品视频生成流水线"""
    
    # Step 1: 素材采集
    update_status(product_id, "scraping")
    images = await scrape_product(product.url)
    
    # Step 2: 产品文档生成
    update_status(product_id, "analyzing")
    doc = await analyze_product(product_id, images)
    
    # Step 3: Prompt 生成
    prompts = await generate_prompts(product_id, doc)
    
    # Step 4-5: 图片/视频生成（手动触发，不在流水线中）
    
    update_status(product_id, "completed")
```

**错误处理**:
- 每步失败时记录 `error_message`
- 更新 `status` 为 `failed`
- 前端显示错误信息和重试按钮

### 8.2 图片生成任务

```python
async def generate_image_for_prompt(prompt_id: UUID):
    """为单个 prompt 生成图片"""
    
    prompt = get_prompt(prompt_id)
    product = get_product(prompt.product_id)
    
    # 获取产品图片作为参考图
    reference_images = get_product_images(product.id)
    
    # 调用 Image 2.0
    image_url = await image_model.generate_image(
        prompt=prompt.prompt_text,
        reference_images=reference_images
    )
    
    # 更新 prompt 记录
    update_prompt(prompt_id, image_url=image_url, image_status="completed")
```

### 8.3 视频生成任务

```python
async def generate_video_for_prompt(prompt_id: UUID):
    """为单个 prompt 生成视频"""
    
    prompt = get_prompt(prompt_id)
    product = get_product(prompt.product_id)
    
    # 获取产品图片作为参考图
    reference_images = get_product_images(product.id)
    
    # 调用 SeedDance 2.0
    task_id = await seedance_model.generate_video(
        prompt=prompt.prompt_text,
        reference_images=reference_images,
        duration=5,
        aspect_ratio="9:16"
    )
    
    # 轮询任务状态
    video_url = await poll_video_status(task_id)
    
    # 更新 prompt 记录
    update_prompt(prompt_id, video_url=video_url, video_status="completed")
```

---

## 9. 技术实现细节

### 9.1 爬虫实现

**依赖**:
- `beautifulsoup4`: HTML 解析
- `requests`: HTTP 请求
- `Pillow`: 图片处理

**图片下载策略**:
1. 提取所有 `<img>` 标签的 `src` 属性
2. 优先提取：Open Graph 图片、JSON-LD 中的 `image` 字段、产品主图区域的图片
3. 过滤：排除 icon/logo/广告图（通过 URL 路径关键词和图片尺寸比例判断），保留产品相关图片
4. 去重：基于图片内容哈希（避免同一图片不同 URL 的重复）
5. 下载到 `products/{product_id}/images/`，按序编号

**Jina 集成**:
```python
def fetch_with_jina(url: str) -> str:
    """使用 Jina 预处理网页"""
    jina_url = f"https://r.jina.ai/{url}"
    response = requests.get(jina_url)
    return response.text  # Markdown 格式
```

### 9.2 AI 模型调用

**视觉分析模型**:
- 复用现有 `vision_model` 配置
- 为每张图片调用 `analyze_frames([image_path])`
- Prompt 设计：三层识别（基础/商品/创意）

**综合分析模型**:
- 复用现有 `analysis_model` 配置
- 输入：产品 JSON 文档 + 模板
- 输出：10 个 prompt 变体

### 9.3 配置管理

**环境变量**:
```python
# .env
LAOZHANG_API_KEY=sk-xxx
VOLCENGINE_API_KEY=xxx
```

**ModelConfig 扩展**:
```python
class ModelConfig(Base):
    # 现有字段
    vision_model: str
    analysis_model: str
    
    # 新增字段
    image_model: str = "laozhang-image-2-vip"
    video_gen_model: str = "seedance-2.0"
```

---

## 10. 测试策略

### 10.1 单元测试

**爬虫测试**:
- 测试不同类型的产品页面（电商/独立站）
- 测试图片提取和去重逻辑
- Mock HTTP 请求

**Prompt 生成测试**:
- 测试模板渲染
- 测试变体生成逻辑
- 验证输出格式

### 10.2 集成测试

**端到端流程测试**:
1. 输入产品网址
2. 验证素材采集完成
3. 验证产品文档生成
4. 验证 Prompt 生成
5. 验证图片生成（Mock API）
6. 验证视频生成（Mock API）

### 10.3 手动测试

**测试用例**:
- 亚马逊商品页
- 淘宝商品页
- Shopify 独立站
- 图片数量不同的页面（3 张 / 10 张 / 20 张）

---

## 11. 部署和运维

### 11.1 依赖安装

```bash
# 后端
cd backend
pip install beautifulsoup4 requests Pillow

# 前端（无新增依赖）
```

### 11.2 数据库迁移

```bash
# 创建新表
alembic revision --autogenerate -m "Add product and product_prompt tables"
alembic upgrade head
```

### 11.3 文件存储

**目录创建**:
```bash
mkdir -p backend/products
```

**清理策略**:
- 产品删除时，同步删除 `products/{product_id}/` 目录
- 定期清理失败的产品项目（可选）

---

## 12. 风险和限制

### 12.1 技术风险

1. **爬虫成功率**: 部分网站可能有反爬机制，导致采集失败
   - **缓解**: 提供实验性 CDP 支持，用户可手动上传图片
2. **AI 识别准确度**: 图片识别结果可能不准确
   - **缓解**: 用户可编辑产品文档
3. **API 调用失败**: Image 2.0 / SeedDance 2.0 可能超时或失败
   - **缓解**: 实现重试机制，显示错误信息

### 12.2 MVP 限制

**暂不实现的功能**:
- 6 宫格图片生成
- 批量视频生成
- 用户自定义模板
- Prompt 差异维度勾选
- 产品项目归档
- 自动化流程配置

**后续迭代计划**:
- V2: 6 宫格 + 批量生成 + 自定义模板
- V3: 差异维度勾选 + 归档功能 + 自动化配置

---

## 13. 交付清单

### 13.1 后端交付

- [ ] `backend/app/api/products.py` - 产品 API 路由
- [ ] `backend/app/models/product.py` - Product 模型
- [ ] `backend/app/models/product_prompt.py` - ProductPrompt 模型
- [ ] `backend/app/services/scraper.py` - 爬虫服务
- [ ] `backend/app/services/product_analyzer.py` - 产品分析服务
- [ ] `backend/app/services/prompt_generator.py` - Prompt 生成器
- [ ] `backend/app/ai_models/image_model.py` - Image 2.0 集成
- [ ] `backend/app/ai_models/seedance_model.py` - SeedDance 2.0 集成
- [ ] `backend/app/tasks/product_pipeline.py` - 异步任务
- [ ] 数据库迁移脚本
- [ ] 单元测试

### 13.2 前端交付

- [ ] `frontend/src/pages/ProductPage.tsx` - 主页面
- [ ] 看板式流程卡片组件
- [ ] 产品信息展示组件
- [ ] Prompt 列表组件
- [ ] API 客户端集成

### 13.3 文档交付

- [ ] API 文档
- [ ] 用户使用指南
- [ ] 开发者文档

---

## 14. 时间估算

**总计**: 2-3 周

**Week 1**:
- Day 1-2: 数据模型 + API 接口
- Day 3-4: 爬虫服务 + 产品分析服务
- Day 5: Prompt 生成器

**Week 2**:
- Day 1-2: Image 2.0 + SeedDance 2.0 集成
- Day 3-4: 前端 UI 实现
- Day 5: 集成测试

**Week 3** (可选):
- Day 1-2: Bug 修复
- Day 3: 文档编写
- Day 4-5: 用户测试和反馈

---

## 15. 成功标准

**核心功能验收**:
- ✅ 用户输入产品网址，系统能成功采集图片和信息
- ✅ 系统能生成产品说明文档（Markdown + JSON）
- ✅ 系统能生成 10 个 prompt 变体
- ✅ 用户能手动触发图片生成，并查看结果
- ✅ 用户能手动触发视频生成，并查看结果
- ✅ 流程看板能正确显示各步骤状态

**性能标准**:
- 素材采集：< 30 秒
- 产品文档生成：< 60 秒
- Prompt 生成：< 120 秒
- 图片生成：< 60 秒
- 视频生成：< 300 秒

**用户体验标准**:
- 流程清晰，用户能理解当前进度
- 错误信息明确，用户知道如何处理
- 生成的 prompt 质量高，可直接使用

---

**设计文档结束**
