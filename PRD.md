# TikTok 爆款视频拆解系统 - 产品需求文档 v3

## 1. 产品概述

**产品名称：** ViralLens（暂定）

**目标用户：** TikTok 内容创作者、MCN 机构、跨境电商运营

**核心价值：** 帮助用户分析爆款视频的营销策略，自动拆解镜头语言，逆向生成可复用的创作提示词，让用户能够快速复刻爆款内容。

**核心目标（产品本质）：**
- 上传视频 → 逆向出提示词 → 拆成多个视频片段做细致分析 → 提炼套路 → 自己能复刻、模拟生成这类爆款

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
- **片段选择器**：在视频时间轴上选择片段（设置起止时间），可创建多个片段
- 片段列表：展示已创建的片段，可单独分析或删除
- 视频信息面板：
  - 时长（如 0:45）
  - 平台（如 TikTok）
  - 点赞数（如 328K）
  - 备注（用户可编辑的文本）

**右侧分析结果区：** 4个可切换 Tab
| Tab | 描述 |
|-----|------|
| 营销策略 | 结构化拆解：目标受众、痛点、情绪钩子、CTA 等 |
| 分镜分析 | 分镜卡片列表：缩略帧图 + 时间戳 + 镜头描述 + 运镜方式 |
| 创意延伸 | 上传产品图片，AI 生成改编建议和新的英文 Prompt |
| 视频包装 | 背景音乐、封面设计、字幕样式、算法优化建议 |
| 脚本智能提取 | 提取视频中的语音文稿，标记关键转折点 |

**每个片段的分析结果：**
- 选择某个片段后，显示该片段单独的AI分析结果
- 片段可单独复制Prompt，便于外部工具使用

### 2.3 历史记录页（HistoryPage）

| 功能 | 描述 |
|------|------|
| 历史记录列表 | 展示所有分析过的视频记录 |
| 记录信息 | 视频名称、上传时间、分析状态 |
| 操作 | 点击跳转至该视频的分析结果页 |
| 删除 | 支持删除历史记录 |

### 2.4 复刻/模拟生成功能

| 功能 | 描述 |
|------|------|
| Prompt导出 | 一键复制完整Prompt，可用于Sora/即梦等视频生成工具 |
| 片段Prompt导出 | 每个片段单独的Prompt，支持分片段复制 |
| 生成教程 | 页面提示如何将Prompt用于外部视频生成工具 |

### 2.5 创意延伸功能

当用户上传自己的产品图片时，系统基于已分析的爆款视频元素，生成改编建议：

| 功能 | 描述 |
|------|------|
| 产品图上传 | 支持拖拽或点击上传产品图片 |
| AI 改编分析 | 分析产品与爆款视频的共同元素 |
| 改编建议 | 3-5条具体改编建议，说明如何将爆款元素应用到该产品 |
| 新Prompt生成 | 生成全新的英文Prompt，可直接用于即梦/Sora |
| 视觉风格参考 | 描述参考的光线、色调、运镜方式 |

**API：** `POST /api/videos/{video_id}/adapt` (multipart/form-data, field: image)

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
│   │   │   ├── reports.py     # 分析结果、历史记录
│   │   │   └── segments.py     # 片段管理
│   │   ├── models/
│   │   │   ├── video.py       # Video模型
│   │   │   ├── report.py      # Report模型
│   │   │   └── segment.py      # Segment模型（视频片段）
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── video_processor.py  # FFmpeg处理
│   │   │   ├── ai_analyzer.py      # 多模型AI分析
│   │   │   └── whisper.py          # Whisper语音识别
│   │   ├── llm/                  # AI模型实现
│   │   ├── tasks/
│   │   │   └── analysis.py    # 异步分析任务
│   │   ├── config.py
│   │   └── database.py
│   ├── uploads/
│   ├── processed/
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   │   ├── Timeline/      # 视频时间轴 + 片段选择器
│   │   │   ├── SegmentList/   # 片段列表
│   │   │   └── ...
│   │   ├── hooks/
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── AnalysisPage.tsx
│   │   │   └── HistoryPage.tsx
│   │   └── ...
│   └── ...
├── CLAUDE.md
└── PRD.md
```

### 3.4 AI 分析流程

```
视频上传成功
    ↓
FFmpeg 提取6个关键帧（均匀分布）
    ↓
FFmpeg 提取音频（MP3格式）
    ↓
Whisper 本地转文字（中文）
    ↓
模型A（视觉分析模型）分析6帧图片
    ↓
模型B（综合分析模型）处理：
  - 营销策略分析（结构/受众/卖点/钩子/情绪/CTA）
  - 分镜场景分析（描述/文字/镜头类型/心理引导）
  - AI提示词生成（英文，可用于Sora/即梦）
  - 语音智能分段（Whisper结果 → 综合分析模型智能分段）
    ↓
存储分析结果（JSON格式）
    ↓
前端实时展示分析结果
```

**片段分析流程：**
```
用户选择视频时间范围（起止时间）→ 创建片段
    ↓
FFmpeg 提取该片段的帧（3帧）
    ↓
Whisper 提取该片段的音频
    ↓
模型A分析片段帧 → 模型B生成片段Prompt
    ↓
存储片段分析结果
    ↓
用户复制Prompt用于外部工具
```

### 3.5 API 设计

#### 视频接口
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/videos/upload | 上传视频文件 |
| GET | /api/videos/{id} | 获取视频信息和分析状态 |
| GET | /api/videos/{id}/stream | 流式获取视频文件 |
| GET | /api/videos/{id}/frames/{frame_index} | 获取视频关键帧图片（1-based索引）|
| POST | /api/videos/{id}/adapt | 创意延伸：上传产品图片，AI 生成改编建议和 Prompt |

#### 片段接口
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/videos/{id}/segments | 创建片段（起止时间） |
| GET | /api/videos/{id}/segments | 获取视频所有片段 |
| GET | /api/segments/{segment_id} | 获取片段分析结果 |
| DELETE | /api/segments/{segment_id} | 删除片段 |

#### 分析报告接口
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/reports/{video_id} | 获取完整分析报告 |
| PATCH | /api/reports/{video_id} | 更新报告备注 |
| GET | /api/reports | 获取历史记录列表 |
| DELETE | /api/reports/{video_id} | 删除记录 |

#### 模型配置接口
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/config/models | 获取支持的模型列表 |
| GET | /api/config/models/current | 获取当前配置的模型 |
| PATCH | /api/config/models | 更新模型配置 |

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
| prompt | text | 逆向Prompt（完整视频） |
| script | text | 语音脚本 |
| created_at | datetime | 创建时间 |

#### Segment 表
| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| video_id | UUID | 关联视频ID |
| start_time | float | 片段起始时间(秒) |
| end_time | float | 片段结束时间(秒) |
| prompt | text | 片段逆向Prompt |
| status | string | pending/completed/failed |
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
- [ ] 顶部进度条正确显示4个步骤状态（未开始时显示灰色，不是蓝色）
- [ ] 左侧视频播放器能正常播放
- [ ] 视频时间轴上可选择起止时间创建片段
- [ ] 片段列表展示所有片段，可单独分析
- [ ] 视频信息面板显示：时长、平台、点赞数、备注（可编辑）
- [ ] 右侧分析区有4个可切换Tab（营销策略/分镜分析/创意延伸/视频包装）
- [ ] Tab2 分镜分析显示视频帧缩略图卡片
- [ ] Tab3 创意延伸支持上传产品图片并返回改编建议和Prompt
- [ ] Prompt支持一键复制
- [ ] 备注保存后不丢失

### 4.3 片段功能
- [ ] 可在视频时间轴上选择片段（起止时间精确到秒）
- [ ] 可创建多个片段
- [ ] 每个片段可单独触发AI分析
- [ ] 每个片段有独立的Prompt结果
- [ ] 片段Prompt支持一键复制
- [ ] 片段可删除

### 4.4 历史记录页
- [ ] 列表展示所有分析记录
- [ ] 点击记录跳转至分析结果页
- [ ] 支持删除记录

### 4.5 视频处理
- [ ] 支持上传 500MB 以内的视频
- [ ] 支持格式：MP4, MOV, AVI, WebM
- [ ] 自动获取视频时长
- [ ] FFmpeg 提取6个均匀分布的关键帧
- [ ] FFmpeg 提取音频为MP3
- [ ] FFmpeg 按片段提取（指定起止时间）

### 4.6 语音识别
- [ ] Whisper 本地small模型识别中文语音
- [ ] 无音频视频容错处理

### 4.7 AI 分析
- [ ] 支持多模型配置（视觉分析模型、综合分析模型独立配置）
- [ ] 支持模型：豆包2.0、OpenAI、Claude、minimax、zhi、deepseek等
- [ ] 视频帧分析（6帧）
- [ ] 片段帧分析（每个片段3帧）
- [ ] 营销策略分析（结构/受众/卖点/钩子/情绪/CTA）
- [ ] 分镜场景分析（描述/文字/镜头类型/心理引导）
- [ ] AI提示词生成（英文）
- [ ] 语音智能分段
- [ ] 分析失败时显示错误信息

### 4.8 复刻支持
- [ ] 完整视频Prompt一键复制
- [ ] 每个片段Prompt单独复制
- [ ] 页面提示如何将Prompt用于Sora/即梦等工具

### 4.9 创意延伸
- [ ] Tab3 上传产品图片（支持拖拽和点击）
- [ ] 点击生成后调用 AI 返回改编建议
- [ ] 显示：产品适配分析、改编建议（3-5条）、新的英文Prompt、视觉风格参考
- [ ] 改编Prompt可一键复制

### 4.9 技术要求
- [ ] 前后端 CORS 正常通信
- [ ] 数据库正常读写
- [ ] Git 提交规范（每功能一个commit）
- [ ] Playwright 测试覆盖核心流程

---

## 5. 开发顺序

1. **Phase 2（项目初始化）** ✅ 已完成
   - 创建前后端项目结构 ✅
   - 配置 CORS ✅
   - 创建数据库模型 ✅
   - 跑通前后端启动 ✅

2. **Phase 3（逐功能开发）**
   - 功能1：视频上传（后端API + 前端组件）→ 待完成
   - 功能2：视频播放和片段选择器 → 待完成
   - 功能3：分析进度条状态管理 → 待完成
   - 功能4：FFmpeg视频处理（提取帧 + 音频 + 片段提取）→ 待完成
   - 功能5：Whisper语音识别 → 待完成
   - 功能6：多模型架构（基类 + 各模型实现）→ 待完成
   - 功能7：AI分析服务（帧分析/策略分析/分镜分析/Prompt生成）→ 待完成
   - 功能8：片段管理（创建/分析/删除）→ 待完成
   - 功能9：分析结果展示（支持片段切换）→ 待完成
   - 功能10：历史记录功能 → 待完成
   - 功能11：模型配置页面 → 待完成

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
