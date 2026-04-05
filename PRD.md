# TikTok 爆款视频拆解系统 - 产品需求文档 v2

## 1. 产品概述

**产品名称：** ViralLens（暂定）

**目标用户：** TikTok 内容创作者、MCN 机构、跨境电商运营

**核心价值：** 帮助用户分析爆款视频的营销策略，自动拆解镜头语言，逆向生成可复用的创作提示词，让用户能够快速复刻爆款内容。

---

## 2. 功能列表

### 2.1 首页（HomePage）

| 功能 | 描述 |
|------|------|
| 功能介绍区 | 展示产品核心能力：智能策略分析、镜头逆向解析、Prompt逆向工程、脚本智能提取 |
| 支持格式说明 | MP4, MOV, AVI, WebM，最大 500MB |
| 上传区域 | 拖拽或点击上传视频文件 |
| 历史记录入口 | 跳转至历史记录页面 |

### 2.2 分析页（AnalysisPage）

**顶部进度条：** 4个步骤的状态显示
1. 视频上传 → 上传至服务器
2. 智能解析 → 调用 AI 分析内容
3. 策略拆解 → 拆解营销策略和内容结构
4. 提示词生成 → 逆向生成英文 Prompt

**左侧视频预览区：**
- 视频播放器（支持播放/暂停）
- 视频信息面板：
  - 时长（如 0:45）
  - 平台（如 TikTok）
  - 点赞数（如 328K）
  - 备注（用户可编辑的文本）

**右侧分析结果区：**
| 功能 | 描述 |
|------|------|
| 智能策略分析 | 拆解视频的营销策略、内容结构、节奏设计，以Markdown格式展示 |
| 镜头逆向解析 | 逐帧还原拍摄手法，列出每个镜头的时间点和内容描述 |
| Prompt逆向工程 | 将视觉内容转化为 Sora/即梦 可用的英文 Prompt，支持一键复制 |
| 脚本智能提取 | 提取视频中的语音文稿，标记关键转折点 |

### 2.3 历史记录页（HistoryPage）

| 功能 | 描述 |
|------|------|
| 历史记录列表 | 展示所有分析过的视频记录 |
| 记录信息 | 视频名称、上传时间、分析状态 |
| 操作 | 点击跳转至该视频的分析结果页 |
| 删除 | 支持删除历史记录 |

---

## 3. 技术架构

### 3.1 多模型支持

系统支持配置多个 AI 模型，用于不同的分析功能：

**模型配置（两组）：**

| 功能组 | 功能 | 可用模型 |
|--------|------|----------|
| 视觉分析模型 | 视频帧分析（6帧均匀分布） | 豆包2.0 / OpenAI / Claude / Cohere / Replicate / HuggingFace / minimax / zhi / deepseek |
| 综合分析模型 | 营销策略分析、分镜场景分析、AI提示词生成、语音智能分段 | 豆包2.0 / OpenAI / Claude / Cohere / Replicate / HuggingFace / minimax / zhi / deepseek |

**说明：**
- 两组模型可独立配置
- 豆包2.0 是可选模型之一，非唯一
- 支持模型：豆包2.0、OpenAI、Claude、Cohere、Replicate、HuggingFace、minimax、zhi、deepseek

### 3.2 技术栈

| 层 | 选择 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS |
| 后端 | Python 3.11 + FastAPI + SQLAlchemy + SQLite |
| 视频处理 | FFmpeg |
| 语音识别 | Whisper（本地 small 模型） |
| AI 分析 | 多模型支持（见上表） |
| 文件存储 | 本地文件系统（uploads/ 目录） |
| 自动化测试 | Playwright |

### 3.3 项目目录结构

```
tiktok-analyzer/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── videos.py      # 视频上传、状态查询
│   │   │   └── reports.py     # 分析结果、历史记录
│   │   ├── models/
│   │   │   ├── video.py       # Video模型
│   │   │   └── report.py      # Report模型
│   │   ├── schemas/
│   │   │   ├── video.py       # Pydantic模型-视频
│   │   │   └── report.py      # Pydantic模型-报告
│   │   ├── services/
│   │   │   ├── video_processor.py  # FFmpeg处理
│   │   │   ├── ai_analyzer.py      # 多模型AI分析
│   │   │   └── whisper.py          # Whisper语音识别
│   │   ├── models/
│   │   │   ├── doubao.py       # 豆包2.0 API
│   │   │   ├── openai.py        # OpenAI API
│   │   │   ├── claude.py        # Claude API
│   │   │   ├── minimax.py       # MiniMax API
│   │   │   ├── zhi.py           # 智谱AI API
│   │   │   ├── deepseek.py      # DeepSeek API
│   │   │   └── base.py          # 模型基类
│   │   ├── tasks/
│   │   │   └── analysis.py    # 异步分析任务
│   │   ├── config.py          # 配置管理（模型配置）
│   │   └── database.py        # 数据库连接
│   ├── uploads/               # 视频存储
│   ├── processed/             # 处理后的片段/截图
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts       # API客户端
│   │   ├── components/
│   │   │   ├── Layout/         # 布局组件
│   │   │   ├── UI/             # 通用UI组件
│   │   │   └── Video/          # 视频相关组件
│   │   ├── hooks/
│   │   │   ├── useVideos.ts    # 视频上传hook
│   │   │   └── useAnalysis.ts  # 分析状态hook
│   │   ├── pages/
│   │   │   ├── HomePage.tsx    # 首页
│   │   │   ├── AnalysisPage.tsx # 分析页
│   │   │   └── HistoryPage.tsx # 历史记录
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript类型
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── CLAUDE.md                   # 项目技术文档
└── PRD.md                     # 本文档
```

### 3.4 AI 分析流程

```
1. 视频上传成功
   ↓
2. FFmpeg 提取6个关键帧（均匀分布）
   ↓
3. FFmpeg 提取音频（MP3格式）
   ↓
4. Whisper 本地转文字（中文）
   ↓
5. 模型A（视觉分析模型）分析6帧图片
   ↓
6. Whisper 语音转文字（中文）
   ↓
7. 模型B（综合分析模型）处理：
   - 营销策略分析（结构/受众/卖点/钩子/情绪/CTA）
   - 分镜场景分析（描述/文字/镜头类型/心理引导）
   - AI提示词生成（英文，可用于Sora/即梦）
   - 语音智能分段（Whisper结果 → 综合分析模型智能分段）
   ↓
8. 存储分析结果（JSON格式）
   ↓
9. 前端实时展示分析结果
```

### 3.5 API 设计

#### 视频接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/videos/upload | 上传视频文件 |
| GET | /api/videos/{id} | 获取视频信息和分析状态 |
| GET | /api/videos/{id}/stream | 流式获取视频文件 |

#### 分析报告接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/reports/{video_id} | 获取完整分析报告 |
| PATCH | /api/reports/{video_id} | 更新报告备注 |
| GET | /api/reports | 获取历史记录列表 |
| DELETE | /api/reports/{video_id} | 删除历史记录 |

#### 模型配置接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/config/models | 获取支持的模型列表 |
| GET | /api/config/models/current | 获取当前配置的模型 |
| PATCH | /api/config/models | 更新模型配置（视觉分析模型/综合分析模型） |

#### 分析状态

| 字段 | 类型 | 描述 |
|------|------|------|
| status | string | pending/uploading/processing/completed/failed |
| progress | object | {upload: 0-100, parse: 0-100, strategy: 0-100, prompt: 0-100} |

### 3.6 数据模型

#### Video 表
| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| filename | string | 原始文件名 |
| filepath | string | 存储路径 |
| filesize | integer | 文件大小(bytes) |
| duration | float | 视频时长(秒) |
| platform | string | 平台来源 |
| likes | string | 点赞数 |
| notes | string | 用户备注 |
| status | string | 分析状态 |
| created_at | datetime | 创建时间 |

#### Report 表
| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| video_id | UUID | 关联视频ID |
| strategy | text | 策略分析结果(JSON) |
| shots | text | 镜头拆解结果(JSON) |
| prompt | text | 逆向Prompt |
| script | text | 语音脚本 |
| created_at | datetime | 创建时间 |

#### ModelConfig 表
| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| vision_model | string | 视觉分析模型名称 |
| analysis_model | string | 综合分析模型名称 |
| updated_at | datetime | 更新时间 |

---

## 4. 验收标准

### 4.1 首页
- [ ] 显示4个功能介绍
- [ ] 支持拖拽上传 MP4/MOV/AVI/WebM
- [ ] 校验文件格式和大小（最大500MB），不合规提示错误
- [ ] 上传时显示进度条
- [ ] 有历史记录入口

### 4.2 分析页
- [ ] 顶部进度条正确显示4个步骤状态
- [ ] 左侧视频播放器能正常播放
- [ ] 视频信息面板显示：时长、平台、点赞数、备注（可编辑）
- [ ] 右侧展示4个分析结果
- [ ] Prompt支持一键复制
- [ ] 备注保存后不丢失

### 4.3 历史记录页
- [ ] 列表展示所有分析记录
- [ ] 点击记录跳转至分析结果页
- [ ] 支持删除记录

### 4.4 视频处理
- [ ] 支持上传 500MB 以内的视频
- [ ] 支持格式：MP4, MOV, AVI, WebM
- [ ] 自动获取视频时长
- [ ] FFmpeg 提取6个均匀分布的关键帧
- [ ] FFmpeg 提取音频为MP3

### 4.5 语音识别
- [ ] Whisper 本地small模型识别中文语音
- [ ] 无音频视频容错处理

### 4.6 AI 分析
- [ ] 支持多模型配置（视觉分析模型、综合分析模型独立配置）
- [ ] 支持模型：豆包2.0、OpenAI、Claude、Cohere、Replicate、HuggingFace、minimax、zhi、deepseek
- [ ] 视频帧分析（6帧）
- [ ] 营销策略分析（结构/受众/卖点/钩子/情绪/CTA）
- [ ] 分镜场景分析（描述/文字/镜头类型/心理引导）
- [ ] AI提示词生成（英文）
- [ ] 语音智能分段
- [ ] 分析失败时显示错误信息

### 4.7 技术要求
- [ ] 前后端 CORS 正常通信
- [ ] 数据库正常读写
- [ ] Git 提交规范（每功能一个commit）
- [ ] Playwright 测试覆盖核心流程

---

## 5. 开发顺序

1. **Phase 2（项目初始化）**
   - 创建前后端项目结构
   - 配置 CORS
   - 创建数据库模型
   - 跑通前后端启动

2. **Phase 3（逐功能开发）**
   - 功能1：视频上传（后端API + 前端组件）
   - 功能2：视频播放和信息展示
   - 功能3：分析进度条状态管理
   - 功能4：FFmpeg视频处理（提取帧 + 音频）
   - 功能5：Whisper语音识别
   - 功能6：多模型架构（基类 + 各模型实现）
   - 功能7：AI分析服务（帧分析/策略分析/分镜分析/Prompt生成）
   - 功能8：分析结果展示
   - 功能9：历史记录功能
   - 功能10：模型配置页面

3. **Phase 4（测试）**
   - Playwright 端到端测试

4. **Phase 5（交付）**
   - 测试报告
   - 启动说明
   - 已知问题

---

## 6. 敏感信息

**需要用户提供：**
- 各模型 API Key（豆包2.0 / OpenAI / Claude / minimax / zhi / deepseek 等）

**不需要问用户：**
- 技术选型、数据库设计、代码报错、项目结构
