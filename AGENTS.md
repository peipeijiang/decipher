# AGENTS.md - TikTok爆款视频分析系统

## 项目概述

**项目名：** ViralLens（暂定）

**核心功能：** 帮助用户分析TikTok爆款视频的营销策略，自动拆解镜头语言，逆向生成可复用的创作提示词。

**目标用户：** TikTok内容创作者、MCN机构、跨境电商运营

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + React Router |
| 后端 | Python 3.11 + FastAPI + SQLAlchemy + SQLite |
| 视频处理 | FFmpeg + ffmpeg-python |
| 语音识别 | Whisper（本地small模型） |
| AI分析 | 多模型支持（OpenAI / Codex / 豆包2.0 / MiniMax / 智谱 / DeepSeek等） |
| 自动化测试 | Playwright |

## 目录结构

```
tiktok-analyzer/
├── backend/
│   ├── app/
│   │   ├── api/           # API路由（videos.py, reports.py, config.py）
│   │   ├── models/         # SQLAlchemy模型（video.py, report.py）
│   │   ├── schemas/        # Pydantic模型
│   │   ├── services/       # 业务逻辑（video_processor, whisper, ai_analyzer）
│   │   ├── ai_models/     # AI模型实现（openai, Codex, doubao, minimax, zhipu, deepseek）
│   │   ├── tasks/         # 后台任务（analysis.py）
│   │   ├── config.py      # 配置
│   │   └── database.py    # 数据库
│   ├── uploads/           # 视频存储
│   ├── processed/         # 处理结果
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/（HomePage, AnalysisPage, HistoryPage）
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── AGENTS.md
```

## 启动命令

### 后端
```bash
cd backend
cp .env.example .env  # 填入API Key
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端
```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --port 3000
```

## API接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/videos/upload | 上传视频 |
| GET | /api/videos/{id} | 获取视频信息和分析状态 |
| GET | /api/videos/{id}/stream | 流式获取视频 |
| GET | /api/reports/{video_id} | 获取分析报告 |
| PATCH | /api/reports/{video_id} | 更新备注 |
| GET | /api/reports | 获取历史记录 |
| DELETE | /api/reports/{video_id} | 删除记录 |
| GET | /api/config/models | 获取支持的模型列表 |
| PATCH | /api/config/models | 更新模型配置 |

## AI分析流程

1. FFmpeg提取6个均匀分布的关键帧
2. FFmpeg提取音频（MP3格式）
3. Whisper本地转文字（中文）
4. 视觉分析模型分析6帧图片
5. 综合分析模型处理：营销策略分析、分镜场景分析、AI提示词生成、语音智能分段
6. 存储JSON结果
7. 前端实时展示

## 多模型配置

两组独立配置：
- **视觉分析模型**：视频帧分析（6帧）
- **综合分析模型**：营销策略分析、分镜场景分析、AI提示词生成、语音智能分段

支持的模型：OpenAI / Codex / 豆包2.0 / MiniMax / 智谱 / DeepSeek / Cohere / Replicate / HuggingFace

## 代码规范

- Python: Black + isort
- TypeScript: ESLint + Prettier
- Git提交：每功能一个commit，格式：`feat: 功能名称`
