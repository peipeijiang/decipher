# 两阶段产品生成流程实现

## 变更概述

将产品视频生成流程从单阶段改为两阶段，允许用户在查看产品说明书后选择视频风格模板。

## 变更详情

### 后端变更

#### 1. `/Users/shane/projects/tiktok-analyzer/backend/app/tasks/product_pipeline.py`

**修改函数:** `run_product_pipeline()`

**变更内容:**
- 移除了自动生成提示词的步骤（Step 4）
- 在生成产品文档后自动触发说明书生成
- 流程在说明书生成后停止，状态设为 `completed`
- 添加日志说明 Phase 1 完成，等待用户选择模板

**新流程:**
```
Phase 1: scrape → analyze → doc → instruction_board → STOP (status=completed)
```

#### 2. `/Users/shane/projects/tiktok-analyzer/backend/app/api/products.py`

**新增端点:** `POST /api/products/{product_id}/generate-prompts`

**功能:**
- 接收 `template_key` 参数（从请求 body 中获取）
- 验证产品状态必须为 `completed`
- 验证产品文档存在
- 在后台线程中生成 10 个提示词变体
- 返回立即响应，不阻塞请求

**请求示例:**
```json
POST /api/products/{product_id}/generate-prompts
{
  "template_key": "grwm"
}
```

**响应示例:**
```json
{
  "ok": true,
  "message": "Prompt generation started"
}
```

### 前端变更

#### 1. `/Users/shane/projects/tiktok-analyzer/frontend/src/api/client.ts`

**新增函数:** `generatePrompts(productId: string, templateKey: string)`

**功能:**
- 调用后端 `/api/products/{product_id}/generate-prompts` 端点
- 传递用户选择的模板 key

#### 2. `/Users/shane/projects/tiktok-analyzer/frontend/src/pages/ProductPage.tsx`

**新增组件:** `GeneratePromptsForm`

**功能:**
- 显示模板选择下拉框
- 显示"生成提示词"按钮
- 处理生成请求和加载状态
- 生成完成后轮询获取新生成的提示词

**UI 变更:**
- 在说明书区域后添加"生成视频提示词"区域
- 仅在产品状态为 `completed` 且没有提示词时显示
- 使用渐变背景突出显示该区域
- 生成后自动轮询并显示提示词列表

**显示条件:**
```typescript
product.status === 'completed' && prompts.length === 0
```

## 用户流程

### 旧流程（单阶段）
1. 用户输入商品链接
2. 系统自动：抓取 → 分析 → 生成文档 → 生成提示词（固定 grwm 模板）
3. 用户查看提示词并生成图片/视频

### 新流程（两阶段）
1. 用户输入商品链接
2. **Phase 1:** 系统自动：抓取 → 分析 → 生成文档 → 生成说明书 → **停止**
3. 用户查看产品信息和说明书
4. **Phase 2:** 用户选择视频风格模板（grwm / unboxing / pov / tutorial 等）
5. 点击"生成提示词"按钮
6. 系统生成 10 个提示词变体
7. 用户查看提示词并生成图片/视频

## 优势

1. **用户控制:** 用户可以根据产品特性选择最合适的视频风格
2. **灵活性:** 支持多种模板，不再固定为 grwm
3. **效率:** 避免生成不需要的提示词，节省 API 调用
4. **体验:** 用户可以先查看产品分析结果再决定创作方向

## 测试验证

所有测试通过：
- ✓ Pipeline 在说明书后正确停止
- ✓ generate-prompts 端点存在
- ✓ 端点正确接收 template_key 参数
- ✓ 提示词生成在后台线程运行
- ✓ 前端 TypeScript 编译无错误
- ✓ 后端 Python 语法检查通过

## 兼容性

- 不影响现有的重新运行和继续运行功能
- 不影响现有的图片和视频生成功能
- 数据库模型无需变更
- API 向后兼容

## 部署说明

1. 拉取最新代码
2. 无需数据库迁移
3. 重启后端服务
4. 重新构建前端
5. 测试创建新产品的完整流程
