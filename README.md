# Decipher

Decipher 是一个面向 TikTok / 短视频内容分析与 AIGC 创意生产的项目，用于把视频素材拆解成可理解、可复用、可再创作的结构化内容资产。

它的核心目标是：帮助运营和内容团队理解“一个短视频为什么有效”，并把分析结果转化为脚本、分镜、Prompt、素材复刻和后续内容生产输入。

## 项目背景

跨境电商和短视频运营中，常见问题包括：

- 视频素材很多，但缺少结构化分析。
- 爆款视频只能凭感觉判断，难以复用。
- 商品卖点、镜头节奏、字幕、语音、场景没有被系统拆解。
- AIGC 视频生成需要高质量 Prompt，但人工写 Prompt 成本高。
- 运营、剪辑、投放之间缺少统一的内容理解语言。

Decipher 的定位是短视频内容分析工作台，把上传视频转化为策略分析、分镜拆解、脚本和 AIGC Prompt。

## 核心能力

| 能力 | 说明 |
|---|---|
| 视频上传与分析 | 支持上传 MP4、MOV、AVI、WebM 等视频格式 |
| 多模型分析 | 支持 OpenAI、Claude、DeepSeek、豆包、MiniMax、智谱等模型配置 |
| 语音识别 | 可选接入 Whisper，对视频语音进行转写 |
| 分镜拆解 | 将视频拆成场景、镜头、动作、节奏和画面元素 |
| 策略分析 | 分析开头 hook、内容结构、卖点表达、转化路径 |
| Prompt 生成 | 将视频理解结果转成可用于 Sora、即梦等工具的 AIGC Prompt |
| 片段级分析 | 支持选择视频片段后生成局部分析和 Prompt |
| 历史记录 | 管理已分析视频和结果 |
| 产品 / 故事板模型 | 支持商品、故事板、复刻流程等数据结构 |

## 最新更新

| 更新 | 说明 |
|---|---|
| 视频脚本生成职责收敛 | 从视频脚本生成器中移除 `layout_instruction`，避免视频脚本阶段混入图片布局约束，让视频脚本专注于剧情、镜头、Hook 和卖点表达。 |
| 图片布局指令模板化 | `layout_instruction` 改为读取 `ImageLayoutTemplate`，使 9 宫格、12 宫格、单图和故事版等图片布局由模板管理统一配置，减少硬编码和前后端不一致。 |
| 智能体 I/O 字段可追踪 | 在智能体工作流中同时展示中文字段名和变量名，方便把输入/输出字段与 system prompt、user prompt 中的变量占位符对应起来，降低 Prompt 调试成本。 |

## 项目结构

```text
decipher/
├── frontend/                 # React / Vite 前端工作台
│   └── src/
│       ├── pages/            # 首页、分析页、历史页、配置页等
│       └── components/       # UI 组件
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── api/              # REST API
│   │   ├── ai_models/        # 多模型适配
│   │   ├── services/         # 视频处理、AI 分析、Prompt 生成
│   │   ├── tasks/            # 后台任务
│   │   └── schemas/          # 数据结构
│   ├── migrations/           # 数据库迁移
│   └── tests/                # 测试用例
├── docs/                     # 设计、进度、重构、报告等文档
├── PRD.md                    # 产品需求文档
├── START.md                  # 快速启动说明
└── QUICK_START_GUIDE.md      # UI/UX 快速预览说明
```

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React、Vite、TypeScript、Tailwind CSS |
| 后端 | Python、FastAPI、SQLAlchemy、Pydantic |
| 视频处理 | FFmpeg、Whisper |
| AI 模型 | OpenAI、Anthropic、DeepSeek、豆包、MiniMax、智谱 |
| 数据层 | SQLite / SQLAlchemy，本地开发友好 |
| 协作方式 | Codex / Claude Code 辅助需求分析、页面实现、后端接口、问题定位 |

## 使用流程

```text
上传视频
→ 视频预处理
→ 语音识别（可选）
→ 多模型内容分析
→ 分镜 / 场景 / 节奏拆解
→ 策略总结
→ 生成 Prompt / 脚本
→ 保存历史记录
→ 反哺内容生产
```

## 快速启动

### 环境要求

- Python 3.11+
- Node.js 18+
- FFmpeg

### 后端

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev -- --port 3000
```

访问：

```text
http://localhost:3000
```

更详细的启动说明见：

- [START.md](START.md)
- [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md)

## AI 模型配置

至少配置一个模型 Key 才能完整运行分析流程：

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
DEEPSEEK_API_KEY=...
DOUBAO_API_KEY=...
MINIMAX_API_KEY=...
ZHIPU_API_KEY=...
```

也可以在应用的模型配置页面中进行管理。

## 与 Wibly Orbit 的关系

Decipher 偏“内容理解”和“创意拆解”，Wibly Orbit 偏“运营编排”和“多平台发布”。

两者可以形成上下游：

```text
Decipher
→ 分析短视频结构、卖点、hook、节奏
→ 输出内容洞察和 Prompt

Wibly Orbit
→ 读取产品素材
→ 生成平台差异化文案
→ Review / Queue / Buffer / Zernio 发布
```

Decipher 的分析结果可以反哺 Wibly Orbit 的内容策略，让文案和视频选择更接近真实平台内容规律。

## AI 实践价值

Decipher 体现了 AI 在内容生产链路中的三类价值：

1. **理解内容**：把视频从“一个文件”拆成镜头、场景、语言、节奏和转化路径。
2. **复用内容**：把成功结构转化为可复用 Prompt、脚本和分镜。
3. **辅助决策**：为选品、素材筛选、广告创意和账号内容规划提供依据。

对个人能力建设而言，它覆盖了：

- 产品需求分析。
- 前端工作台设计。
- 后端分析任务与 API。
- 多模型 AI 适配。
- 视频处理和语音识别。
- AIGC Prompt 生产。
- 项目文档和工程化沉淀。

## 安全与脱敏

本仓库是脱敏后的 GitHub 版本，已排除：

- `.env`
- API Key
- 运行数据库
- 上传文件
- 生成视频
- 缓存目录
- 日志
- 大体积临时文件

上传前已清理 `sk-...` 样式密钥。

## 相关仓库

- Wibly Orbit: <https://github.com/peipeijiang/wibly-orbit>
- Product UGC Pipeline: <https://github.com/peipeijiang/product-ugc-pipeline>
- AI Practice Notes: <https://github.com/peipeijiang/ai-practice-notes>
