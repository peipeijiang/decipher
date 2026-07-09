<p align="center">
  <img src="frontend/public/favicon.svg?raw=1" width="80" alt="Decipher" />
</p>
<h1 align="center">Decipher</h1>
<p align="center">
  <strong>AI 短视频内容工作台 — 分析爆款 · 复刻结构 · 批量出片</strong>
</p>
<p align="center">
  <a href="https://github.com/peipeijiang/decipher/releases"><img src="https://img.shields.io/badge/macOS-DMG-blue" alt="macOS"></a>
  <a href="https://github.com/peipeijiang/decipher/releases"><img src="https://img.shields.io/github/v/release/peipeijiang/decipher" alt="release"></a>
  &nbsp;·&nbsp;
  <a href="README.md">🇨🇳 中文</a> · <a href="README_EN.md">🇬🇧 English</a>
</p>

---

## 功能地图

<table>
<tr>
  <td width="25%" align="center"><b>🔍 爆款复刻</b><br><sub>上传 TikTok 视频 → 策略·分镜·Prompt</sub></td>
  <td width="25%" align="center"><b>📦 产品视频</b><br><sub>1688 链接 → 产品文档 → AIGC 脚本</sub></td>
  <td width="25%" align="center"><b>🧠 智能体工作流</b><br><sub>自定义 Prompt 模板 → 编排分析管线</sub></td>
  <td width="25%" align="center"><b>🎬 视频生成</b><br><sub>多模型集成 · 一键批量出片</sub></td>
</tr>
</table>

---

### 爆款复刻

> 把你刷到的 TikTok 爆款视频拆成可复用的结构资产。AI 分析：它为什么爆？分镜怎么切的？Prompt 该怎么写？然后自动生成 10 个可替换产品/场景的创意变体。

| 工作台 | 分析报告 |
|:---:|:---:|
| ![工作台](docs/screenshots/02-workbench.png?raw=1) | ![分析报告](docs/screenshots/03-replica-analysis.png?raw=1) |

| 创意变体 | 分镜复刻 |
|:---:|:---:|
| ![创意变体](docs/screenshots/04b-replica-creative.png?raw=1) | ![分镜复刻](docs/screenshots/04-replica-storyboard.png?raw=1) |

#### 三步走：拆解 → 复刻 → 出片

**Step 1 — 拆解**：上传视频 → Whisper 语音转文字 → 自适应关键帧提取 → 多模型分析 → 输出**营销策略 + 分镜时间轴 + 逆向 Prompt**

**Step 2 — 复刻**：AI 提取核心创意公式 → 自动生成 **10 个变体**（标题 · Hook 画面 · 开场文案 · 分镜序列 · 情绪曲线），保留爆款结构，替换场景/产品/情绪。

**Step 3 — 出片**：勾选变体 → 选模型 → 一键批量提交视频生成。Storyboard 自动作为参考图传入。

---

### 产品视频

> 粘贴 1688 / Shopify / 任意电商链接，AI 自动抓取产品信息、生成结构化产品文档、输出 10 个 TikTok 视频脚本变体，对接视频生成模型直接出片。

![产品页](docs/screenshots/06-product.png?raw=1)

1. **链接抓取**：输入商品链接，自动提取标题、价格、主图、卖点
2. **产品文档**：AI 分析产品特性 → 结构化产品认知（使用场景 · 目标人群 · 卖点排序）
3. **脚本生成**：根据模板生成 10 个视频脚本变体，含 Hook、分镜、文案、BGM
4. **视频出片**：勾选脚本 → 选择视频模型 → 批量生成

---

### 智能体工作流

> 自定义 Prompt 模板，编排分析管线。把上面的所有流程拆成可配置的「智能体」，每个节点可独立调整模型、Prompt、输入输出。

![智能体工作流](docs/screenshots/07-agent-workflow.png?raw=1)

#### 内置智能体

| 智能体 | 职责 | 输入 | 输出 |
|--------|------|------|------|
| 营销策略分析 | 视频类型 · 转化逻辑 · 用户心智 | 视频帧 + 转写文本 | 策略报告 |
| 分镜分析 | 镜头类型 · 节奏 · 画面元素 | 视频帧 + 时间轴 | 分镜 JSON |
| 逆向 Prompt 生成 | 还原拍摄指令 | 策略 + 分镜 | AIGC Prompt |
| 创意改写 | 批量生成变体 | 核心创意 + 逆向 Prompt | 10 个变体 |
| 分镜复刻 | 抽取关键帧拼图 | 视频 + 分镜时间戳 | Storyboard 图片 |
| 产品文档生成 | 1688 链接 → 产品认知 | 产品链接 | 结构化 JSON |
| 视频脚本生成 | 产品文档 → 拍摄脚本 | 产品 JSON + 模板 | 10 个脚本 |

每个智能体可独立配置**视觉模型**和**文本模型**（DeepSeek / MiniMax / OpenAI 等）。

---

### 视频生成

> 把创意变成视频的最后一步。承接爆款复刻的分析结果和产品视频的脚本输出，一键提交视频生成任务，多模型并行，自动轮询状态，成品直接下载。

![视频生成](docs/screenshots/08-video-gen.png?raw=1)

#### 两种工作模式

**模式一：流水线模式**（推荐）

在爆款复刻 / 产品视频页面，勾选创意变体或视频脚本 → 选择模型 · 比例 · 时长 → 点击生成。Storyboard 自动作为参考图传入，保证产品外观在视频中保真。

**模式二：自由创作模式**

在视频生成页面直接输入 Prompt，上传参考图（可选），自由选择模型和参数，适合定制化需求。

#### 内置视频模型

| 模型 | 引擎 | 能力 | 时长 | 参考图 | 适用场景 |
|------|------|------|------|--------|----------|
| **Omni Flash 10s** | Google Gemini | 图+Prompt → 含音效视频 | 10s | ✅ 最多7张 | 剧情/场景复刻 |
| **Seedance 2.0** | 字节跳动 | 图+Prompt → 视频 | 4–15s | ✅ | 产品展示/UGC |
| **Veo 3.1** | Google | 图生视频 | 5–8s | ✅ | 高质量质感视频 |
| **HappyHorse** | 阿里云 | 文生视频 | 3–15s | ❌ | 快速原型 |
| **Wan 2.6** | 阿里云 | 文生视频 | 3–15s | ❌ | 创意探索 |

#### 任务管理

- **队列管理**：批量提交自动排队，避免并发过载
- **实时状态**：等待中 → 生成中 → 完成 / 失败，页面自动轮询
- **视频下载**：完成后自动下载到本地，支持重试失败任务
- **历史记录**：所有生成记录可回溯，Prompt 可重新编辑再提交

---

### 模板配置

> 所有 Prompt 模板集中管理，包括视频脚本模板、图片布局模板、Hook 模板，可版本化迭代。

![模板配置](docs/screenshots/09-templates.png?raw=1)

---

### 多模型配置

支持 **DeepSeek / MiniMax / OpenAI / Claude / 豆包 / 智谱**，视觉模型和文本模型可独立选择，API Key 在线管理。

![模型配置](docs/screenshots/05-config.png?raw=1)

---

### 技术架构

```
前端：React 18 + Vite + TypeScript + TailwindCSS
后端：FastAPI + SQLAlchemy + SQLite
视频：FFmpeg + Whisper (本地 small 模型)
AI：  DeepSeek / MiniMax / OpenAI / Claude / 豆包 / 智谱
部署：macOS .app 双击即用 (http://127.0.0.1:18888)
```

### 快速开始

**方式一：macOS 应用**

从 [Releases](https://github.com/peipeijiang/decipher/releases) 下载 Decipher.dmg → 拖入 /Applications → 双击运行。首次自动安装依赖。

**方式二：源码**

```bash
git clone https://github.com/peipeijiang/decipher.git
cd backend && cp .env.example .env && pip install -r requirements.txt
uvicorn main:app --port 8000

cd frontend && npm install && npm run dev -- --port 18889
```

---

<p align="center">
  <a href="README.md">🇨🇳 中文</a> · <a href="README_EN.md">🇬🇧 English</a>
</p>
