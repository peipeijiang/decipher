# ViralLens — 快速启动指南

## 环境要求

| 工具 | 版本要求 | 安装方式 |
|------|----------|----------|
| Python | 3.11+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| FFmpeg | 任意稳定版 | `brew install ffmpeg` (macOS) |

验证环境：

```bash
python3 --version   # 3.11+
node --version      # 18+
ffmpeg -version     # 任意版本即可
```

---

## 安装步骤

### 后端

```bash
cd backend
cp .env.example .env        # 复制环境变量模板
# 编辑 .env，填入至少一个 AI 模型的 API Key（见下方说明）
pip install -r requirements.txt
```

### 前端

```bash
cd frontend
cp .env.example .env        # 若存在；否则跳过
npm install
```

---

## 启动命令

### 1. 启动后端（终端窗口1）

```bash
cd backend
uvicorn main:app --reload --port 8000
```

启动成功后看到：`Uvicorn running on http://127.0.0.1:8000`

### 2. 启动前端（终端窗口2）

```bash
cd frontend
npm run dev -- --port 3000
```

启动成功后看到：`Local: http://localhost:3000/`

### 3. 打开浏览器

访问 http://localhost:3000

---

## AI 模型配置

至少配置一个模型才能运行分析。支持以下模型：

| 模型 | 环境变量 | 获取 Key |
|------|----------|---------|
| OpenAI (gpt-4o) | `OPENAI_API_KEY` | https://platform.openai.com |
| Claude | `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| 豆包2.0 | `DOUBAO_API_KEY` | https://console.volcengine.com |
| MiniMax | `MINIMAX_API_KEY` | https://api.minimax.chat |
| 智谱 GLM | `ZHIPU_API_KEY` | https://open.bigmodel.cn |
| DeepSeek | `DEEPSEEK_API_KEY` | https://platform.deepseek.com |

在 `backend/.env` 中填入：

```
OPENAI_API_KEY=sk-...
# 或其他模型的 Key
```

也可以在应用界面中通过「模型配置」页面配置 API Key 和模型选择。

---

## 使用流程

1. 打开首页，将视频文件拖拽到上传区域（或点击上传）
2. 支持格式：MP4, MOV, AVI, WebM，最大 500MB
3. 上传后自动跳转分析页，实时显示分析进度
4. 分析完成后查看：智能策略分析、分镜场景分析、AI 提示词、语音脚本
5. 点击「复制」按钮一键复制 Prompt，用于 Sora/即梦 等视频生成工具
6. 在时间轴上拖拽选择片段，点击「创建片段」→「分析」获取片段级 Prompt
7. 历史记录页查看所有分析过的视频

---

## Whisper 语音识别（可选）

Whisper 是可选功能。若未安装，视频分析会跳过语音识别步骤，其他功能正常运行。

安装 Whisper（首次使用会自动下载 ~500MB 模型）：

```bash
pip install openai-whisper
```

首次转录时会下载 small 模型，请保持网络连接。

---

## 常见问题

**Q: 上传后分析一直显示「分析中」不完成？**
A: 检查 API Key 是否正确配置，查看后端终端日志（uvicorn 输出）了解错误详情。

**Q: 视频播放器无法播放？**
A: 部分浏览器对 MOV/AVI 格式支持有限。推荐使用 Chrome 并上传 MP4 格式。

**Q: Whisper 转录报错？**
A: 确认已安装 `openai-whisper` 且 FFmpeg 在 PATH 中。无音频的视频会自动跳过转录。

**Q: 后端启动报 ImportError？**
A: 确认在 `backend/` 目录下运行，且已执行 `pip install -r requirements.txt`。

---

## 项目结构

```
tiktok-analyzer/
├── backend/          # FastAPI 后端（端口 8000）
│   ├── app/
│   │   ├── api/      # REST 路由
│   │   ├── ai_models/  # 多模型实现
│   │   ├── services/ # FFmpeg、Whisper、AI 分析
│   │   └── tasks/    # 后台分析任务
│   └── main.py
├── frontend/         # React 前端（端口 3000）
│   └── src/
│       └── pages/    # HomePage, AnalysisPage, HistoryPage
├── PRD.md            # 产品需求文档
└── START.md          # 本文件
```
