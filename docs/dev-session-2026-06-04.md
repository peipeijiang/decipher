# 开发记录 2026-06-04

## 一、图片提示词生成修复（故事板模板）

### 问题
- GPT Image 2 生成故事板时，模板格式是结构化 spec（sections/bullets），效果差
- MiniMax 模型不稳定，有时返回空字符串或输出推理过程

### 解决方案

#### 1. 模板重写
- `story_flow_5`: 改为纯布局结构描述 + `{placeholder}` 占位符，16:9 横版
- `industrial_macro_5`: 同理，9:16 竖版
- 模板只描述布局（区域位置），不预设内容/风格/氛围

**story_flow_5 当前模板：**
```
Generate a single 16:9 horizontal product advertisement storyboard. The theme title is "{product_name} 15s Video Visual Planning". Background color: {background_color}, with {divider_style} divider lines, paired with {accent_colors} accent color cards. The layout includes the following areas: character reference ({character_description}), product appearance ({product_appearance}), scene environment ({scene_description}), props samples ({props_description}), an 8-panel storyboard strip ({panel_1}...{panel_8}), motion/movement diagram ({motion_description}), audio labels ({audio_description}), and shot type annotations ({shot_types}). {visual_style}. {overall_mood}.
```

#### 2. Pipeline 改造（product_pipeline.py）
- LLM 负责根据视频脚本填充模板占位符
- 重试逻辑：最多3次，检测空响应和推理输出
- Fallback：MiniMax 失败后自动切换到智谱(zhipu)
- max_tokens 提高到 4096 防止截断
- 对 storyboard 模板每次生成都强制重新生成 image_prompt

#### 3. 推理输出检测
```python
bad_prefixes = ("The user", "I need to", "Let me", "Here's", "Based on", "I'll", "I will", "We need", "We must", "First,", "So we", "The template")
```

### 关键文件
- `backend/app/tasks/product_pipeline.py` — 图片提示词生成逻辑
- `backend/app/services/image_generator.py` — 图片生成服务（支持 base_url 参数）
- 数据库表 `image_layout_templates` — 模板存储

---

## 二、前端改进

### 图片布局下拉动态化
- 从后端 API `/api/templates/image-layout?active_only=true` 动态获取
- 不再硬编码模板选项
- 新增 `getImageLayoutTemplates()` API 函数

### 图片预览
- 生成的图片点击可全屏预览
- `onPreviewImage` 回调传给 PromptCard

### 关键文件
- `frontend/src/pages/ProductPage.tsx`
- `frontend/src/api/client.ts`

---

## 三、Updrama Image 2 模型接入

### 配置
- 前端 ConfigPage 新增 "Updrama Image 2" 选项和 API Key 输入
- 后端支持 `_updrama_api_key` 存储
- Pipeline 根据 `image_model` 选择 API base URL
  - `updrama-image-2` → `https://api.lk888.ai/api/v1`
  - 其他 → `https://api.laozhang.ai/v1`

### API Key
```
sk-REDACTED
```

### 关键文件
- `backend/app/schemas/report.py` — 新增 updrama_api_key 字段
- `backend/app/api/reports.py` — 处理 key 保存/读取
- `frontend/src/pages/ConfigPage.tsx` — UI

---

## 四、智能体工作流可视化

### 概述
将所有 pipeline 中的 LLM 调用（智能体）提取为可配置项，存入数据库，通过 ReactFlow 工作流画布可视化展示，用户点击节点即可编辑提示词，保存即生效。

### 14个智能体

| Key | 名称 | 作用 |
|-----|------|------|
| `product_image_analyzer` | 产品图片分析 | 3层AI识别（外观/卖点/创意建议） |
| `image_filter` | 图片过滤 | 过滤非产品图片 |
| `product_appearance_extractor` | 产品外观提取 | 从参考图提取产品外观描述 |
| `reference_image_picker` | 参考图选择 | 从多张产品图中选最佳参考图 |
| `product_doc_generator` | 产品文档生成 | 综合分析生成结构化产品文档 |
| `instruction_board_generator` | 说明书生成 | 生成产品使用说明书图片 |
| `video_script_generator` | 视频脚本生成 | 根据产品文档生成10个视频脚本变体 |
| `prompt_refiner` | 提示词优化 | 根据用户指令优化视频脚本 |
| `hook_picker` | Hook策略选择 | 自动选择最佳开场策略 |
| `single_prompt_regenerator` | 单条脚本重生成 | 重新生成单条视频脚本 |
| `storyboard_filler` | 故事板填充 | 根据视频脚本填充模板占位符 |
| `multi_panel_storyboard` | 多宫格分镜 | 将视频脚本转为N格分镜提示词 |
| `single_image_prompt` | 单图提示词 | 将视频脚本转为单张图片提示词 |
| `video_to_image_converter` | 格式转换 | 视频脚本格式转图片提示词 |

### 工作流结构
```
[产品页面爬取] → [产品图片分析] → [图片过滤] → [产品外观提取] ↘
                                              → [参考图选择]    → [产品文档生成] → [说明书生成]
                                                                                → [视频脚本生成] → [提示词优化]
                                                                                                  → [Hook策略选择]
                                                                                                  → [单条脚本重生成]
                                                                                                  → [图片提示词分支]
                                                                                                      ├── [故事板填充]
                                                                                                      ├── [多宫格分镜]
                                                                                                      ├── [单图提示词]
                                                                                                      └── [格式转换]
```

### 数据库模型
```python
# backend/app/models/agent_prompt.py
class AgentPrompt(Base):
    __tablename__ = "agent_prompts"
    id: str (UUID, PK)
    key: str (unique, indexed)
    name: str
    description: str (Text)
    system_prompt: str (Text)        # 系统指令
    user_prompt_template: str (Text) # 用户消息模板，含 {变量}
    variables: str (Text)            # JSON 数组，可用变量列表
    is_custom: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
```

### API 端点
```
GET    /api/agent-prompts          — 列表
GET    /api/agent-prompts/{id}     — 详情
PATCH  /api/agent-prompts/{id}     — 编辑 system_prompt / user_prompt_template
POST   /api/agent-prompts          — 新建自定义
DELETE /api/agent-prompts/{id}     — 删除（仅自定义）
POST   /api/agent-prompts/{id}/reset — 重置内置为默认值
```

### 保存即生效机制
- Pipeline 中**不缓存** prompt，每次执行时从 DB 实时读取
- 使用 `get_agent_prompt(db, key)` 工具函数
- 如果 DB 查不到，fallback 到硬编码默认值

### 前端实现
- 使用 `@xyflow/react` (ReactFlow) 渲染工作流画布
- 自定义节点组件：蓝色边框=可编辑，灰色=流程标记
- 点击节点打开右侧编辑面板（480px drawer）
- 编辑面板支持变量高亮预览
- `key={selectedPrompt.id}` 确保切换节点时 state 正确重置

### 关键文件
| 文件 | 说明 |
|------|------|
| `backend/app/models/agent_prompt.py` | 数据库模型 |
| `backend/app/api/agent_prompts.py` | CRUD API + get_agent_prompt() |
| `backend/migrations/add_agent_prompts.py` | 种子数据（14个默认智能体） |
| `backend/app/tasks/product_pipeline.py` | 改造：从 DB 读取 prompt |
| `backend/app/services/prompt_generator.py` | 改造：video_script_generator |
| `backend/app/services/product_analyzer.py` | 改造：image_analyzer, filter, doc |
| `backend/app/api/products.py` | 改造：refiner, hook_picker, regenerator, instruction_board |
| `frontend/src/pages/AgentWorkflowPage.tsx` | 工作流可视化页面 |
| `frontend/src/config/navigation.ts` | 导航：产品视频 → 智能体工作流 |

---

## 五、后续开发建议

1. **工作流节点可拖拽**：当前节点位置硬编码，可考虑让用户拖拽调整布局并持久化
2. **运行状态可视化**：pipeline 执行时高亮当前运行的节点
3. **版本历史**：记录 prompt 修改历史，支持回滚
4. **A/B 测试**：同一个智能体配置多个 prompt 版本，对比效果
5. **自定义工作流**：允许用户添加/删除节点，自定义 pipeline 流程
