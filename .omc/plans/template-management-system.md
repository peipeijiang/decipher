# 模板管理系统实现计划

## 计划概述

**目标**: 将硬编码的提示词模板迁移到数据库，实现可视化的模板管理界面，支持 CRUD 操作和模板变体管理。

**范围**: 
- 后端：新增 PromptTemplate 数据库模型、API 端点、迁移脚本
- 前端：新增模板管理页面（/settings/templates）、模板编辑器组件
- 数据迁移：将现有 TEMPLATES 字典迁移到数据库

**复杂度**: MEDIUM

**预计影响文件数**: 12 个文件（新增 6 个，修改 6 个）

---

## 工作目标

### 核心功能
1. **数据库层**: 创建 PromptTemplate 模型，支持模板存储和版本管理
2. **API 层**: 提供完整的 CRUD 端点，替换现有硬编码模板读取逻辑
3. **UI 层**: 构建模板管理界面，支持创建、编辑、删除、预览模板
4. **数据迁移**: 平滑迁移现有模板数据，保持向后兼容

### 非功能需求
- 保持现有 API 接口兼容性（GET /api/products/templates）
- 支持模板变量验证（确保 {product_name} 等占位符正确）
- 提供模板预览功能（实时渲染示例）
- 确保数据库迁移可回滚

---

## 必须遵守的约束（Guardrails）

### Must Have
- ✅ 数据库模型必须包含：template_key, name, description, prompt_text, grid_layout, is_active
- ✅ API 必须支持：列表查询、单个查询、创建、更新、删除、启用/禁用
- ✅ 前端必须支持：模板列表展示、表单编辑、实时预览、删除确认
- ✅ 迁移脚本必须将现有 5 个模板（single_product, 3x2_grid, lifestyle, comparison, feature_highlight）迁移到数据库
- ✅ 所有代码必须遵循不可变性原则（immutability）
- ✅ 必须包含单元测试（80%+ 覆盖率）

### Must NOT Have
- ❌ 不允许删除现有 TEMPLATES 字典（保留作为 fallback）
- ❌ 不允许破坏现有 API 接口（GET /api/products/templates 必须继续工作）
- ❌ 不允许在前端硬编码模板数据
- ❌ 不允许直接修改 product_pipeline.py 的核心逻辑（仅修改模板读取部分）

---

## 任务流程

### Phase 1: 数据库层（Backend Model & Migration）
**目标**: 创建数据库模型和迁移脚本

**文件操作**:
1. **新增**: `/Users/shane/projects/tiktok-analyzer/backend/app/models/prompt_template.py`
   - 创建 `PromptTemplate` SQLAlchemy 模型
   - 字段：id, template_key (unique), name, description, prompt_text, grid_layout, aspect_ratio, is_active, created_at, updated_at
   - 索引：template_key (unique), is_active

2. **新增**: `/Users/shane/projects/tiktok-analyzer/backend/alembic/versions/xxxx_add_prompt_templates.py`
   - 创建 Alembic 迁移脚本
   - 包含 upgrade() 和 downgrade() 函数
   - 迁移现有 5 个模板到数据库

3. **修改**: `/Users/shane/projects/tiktok-analyzer/backend/app/models/__init__.py`
   - 导出 PromptTemplate 模型

**验收标准**:
- [ ] PromptTemplate 模型通过 SQLAlchemy 类型检查
- [ ] 迁移脚本可成功执行 `alembic upgrade head`
- [ ] 迁移脚本可成功回滚 `alembic downgrade -1`
- [ ] 数据库中存在 5 条初始模板记录

---

### Phase 2: API 层（Backend Routes）
**目标**: 创建模板管理 API 端点

**文件操作**:
1. **新增**: `/Users/shane/projects/tiktok-analyzer/backend/app/api/templates.py`
   - `GET /api/templates` - 列出所有模板（支持 is_active 过滤）
   - `GET /api/templates/{template_key}` - 获取单个模板
   - `POST /api/templates` - 创建新模板
   - `PUT /api/templates/{template_key}` - 更新模板
   - `DELETE /api/templates/{template_key}` - 删除模板
   - `PATCH /api/templates/{template_key}/toggle` - 启用/禁用模板

2. **新增**: `/Users/shane/projects/tiktok-analyzer/backend/app/schemas/template.py`
   - `TemplateCreate` - 创建模板的 Pydantic schema
   - `TemplateUpdate` - 更新模板的 Pydantic schema
   - `TemplateResponse` - 返回模板的 Pydantic schema

3. **修改**: `/Users/shane/projects/tiktok-analyzer/backend/app/main.py`
   - 注册 templates 路由：`app.include_router(templates.router, prefix="/api", tags=["templates"])`

4. **修改**: `/Users/shane/projects/tiktok-analyzer/backend/app/api/products.py`
   - 修改 `GET /api/products/templates` 端点
   - 从数据库读取模板（保留 TEMPLATES 作为 fallback）

**验收标准**:
- [ ] 所有 API 端点返回正确的 HTTP 状态码
- [ ] POST/PUT 请求验证输入数据（template_key 唯一性、prompt_text 非空）
- [ ] DELETE 请求返回 404（如果模板不存在）
- [ ] GET /api/products/templates 返回数据格式与之前一致
- [ ] 所有端点通过 Postman/curl 测试

---

### Phase 3: 前端路由和页面结构（Frontend Routing）
**目标**: 创建模板管理页面路由和基础布局

**文件操作**:
1. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/pages/TemplateManagementPage.tsx`
   - 页面布局：顶部导航 + 模板列表 + 编辑面板
   - 状态管理：templates, selectedTemplate, isEditing, isCreating
   - 集成 API 调用：useEffect 加载模板列表

2. **修改**: `/Users/shane/projects/tiktok-analyzer/frontend/src/App.tsx`
   - 添加路由：`<Route path="/settings/templates" element={<TemplateManagementPage />} />`

3. **修改**: `/Users/shane/projects/tiktok-analyzer/frontend/src/components/Sidebar.tsx`
   - 添加导航链接：设置 → 模板管理

**验收标准**:
- [ ] 访问 /settings/templates 显示页面（无 404）
- [ ] 页面布局符合设计（左侧列表 + 右侧编辑器）
- [ ] 侧边栏导航链接正确高亮

---

### Phase 4: 前端组件实现（Frontend Components）
**目标**: 实现模板列表、编辑器、预览组件

**文件操作**:
1. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/components/TemplateList.tsx`
   - 显示模板卡片（名称、描述、状态）
   - 支持点击选中、删除确认对话框
   - 显示启用/禁用状态（绿色/灰色标记）

2. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/components/TemplateEditor.tsx`
   - 表单字段：template_key, name, description, prompt_text, grid_layout, aspect_ratio
   - 实时验证：template_key 格式、prompt_text 非空
   - 保存/取消按钮

3. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/components/TemplatePreview.tsx`
   - 显示模板渲染示例（使用示例产品数据）
   - 高亮显示变量占位符（{product_name}, {key_features}）

4. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/api/templates.ts`
   - API 调用函数：fetchTemplates, createTemplate, updateTemplate, deleteTemplate, toggleTemplate

**验收标准**:
- [ ] 模板列表正确显示所有模板
- [ ] 点击模板卡片加载编辑器
- [ ] 编辑器表单验证正常工作
- [ ] 保存后列表自动刷新
- [ ] 删除操作显示确认对话框
- [ ] 预览组件正确渲染示例数据

---

### Phase 5: 集成测试和数据迁移（Integration & Migration）
**目标**: 确保新系统与现有流程无缝集成

**文件操作**:
1. **修改**: `/Users/shane/projects/tiktok-analyzer/backend/app/services/prompt_generator.py`
   - 修改 `get_template()` 函数：优先从数据库读取，fallback 到 TEMPLATES 字典
   - 保持函数签名不变

2. **新增**: `/Users/shane/projects/tiktok-analyzer/backend/tests/test_templates_api.py`
   - 测试所有 API 端点（CRUD 操作）
   - 测试边界情况（重复 template_key、删除不存在的模板）

3. **新增**: `/Users/shane/projects/tiktok-analyzer/frontend/src/pages/__tests__/TemplateManagementPage.test.tsx`
   - 测试页面渲染
   - 测试 CRUD 操作流程
   - 测试错误处理

**验收标准**:
- [ ] 现有产品生成流程正常工作（使用数据库模板）
- [ ] 后端测试覆盖率 ≥ 80%
- [ ] 前端测试通过（npm test）
- [ ] 手动测试：创建产品 → 生成提示词 → 验证使用了数据库模板

---

## 详细实现指南

### 数据库模型设计

```python
# /Users/shane/projects/tiktok-analyzer/backend/app/models/prompt_template.py
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_key: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    grid_layout: Mapped[str] = mapped_column(String, default="single")  # single, 3x2, 2x3
    aspect_ratio: Mapped[str] = mapped_column(String, default="9:16")  # 9:16, 16:9, 1:1
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_prompt_templates_active_key', 'is_active', 'template_key'),
    )
```

### API 端点设计

```python
# /Users/shane/projects/tiktok-analyzer/backend/app/api/templates.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.prompt_template import PromptTemplate
from app.schemas.template import TemplateCreate, TemplateUpdate, TemplateResponse

router = APIRouter()

@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(is_active: bool | None = None, db: Session = Depends(get_db)):
    """列出所有模板"""
    query = db.query(PromptTemplate)
    if is_active is not None:
        query = query.filter(PromptTemplate.is_active == is_active)
    return query.order_by(PromptTemplate.created_at.desc()).all()

@router.get("/templates/{template_key}", response_model=TemplateResponse)
async def get_template(template_key: str, db: Session = Depends(get_db)):
    """获取单个模板"""
    template = db.query(PromptTemplate).filter(PromptTemplate.template_key == template_key).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def create_template(data: TemplateCreate, db: Session = Depends(get_db)):
    """创建新模板"""
    # 检查 template_key 是否已存在
    existing = db.query(PromptTemplate).filter(PromptTemplate.template_key == data.template_key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template key already exists")
    
    template = PromptTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template

@router.put("/templates/{template_key}", response_model=TemplateResponse)
async def update_template(template_key: str, data: TemplateUpdate, db: Session = Depends(get_db)):
    """更新模板"""
    template = db.query(PromptTemplate).filter(PromptTemplate.template_key == template_key).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    
    db.commit()
    db.refresh(template)
    return template

@router.delete("/templates/{template_key}", status_code=204)
async def delete_template(template_key: str, db: Session = Depends(get_db)):
    """删除模板"""
    template = db.query(PromptTemplate).filter(PromptTemplate.template_key == template_key).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(template)
    db.commit()

@router.patch("/templates/{template_key}/toggle", response_model=TemplateResponse)
async def toggle_template(template_key: str, db: Session = Depends(get_db)):
    """启用/禁用模板"""
    template = db.query(PromptTemplate).filter(PromptTemplate.template_key == template_key).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template.is_active = not template.is_active
    db.commit()
    db.refresh(template)
    return template
```

### 前端页面布局

```typescript
// /Users/shane/projects/tiktok-analyzer/frontend/src/pages/TemplateManagementPage.tsx
import React, { useState, useEffect } from 'react'
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api/templates'
import TemplateList from '../components/TemplateList'
import TemplateEditor from '../components/TemplateEditor'
import TemplatePreview from '../components/TemplatePreview'

export default function TemplateManagementPage() {
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const data = await fetchTemplates()
    setTemplates(data)
  }

  const handleSave = async (templateData) => {
    if (isCreating) {
      await createTemplate(templateData)
    } else {
      await updateTemplate(selectedTemplate.template_key, templateData)
    }
    await loadTemplates()
    setIsEditing(false)
    setIsCreating(false)
  }

  const handleDelete = async (templateKey) => {
    if (confirm('确定要删除此模板吗？')) {
      await deleteTemplate(templateKey)
      await loadTemplates()
      setSelectedTemplate(null)
    }
  }

  return (
    <div className="flex h-screen">
      {/* 左侧：模板列表 */}
      <div className="w-1/3 border-r overflow-y-auto">
        <div className="p-4">
          <button
            onClick={() => { setIsCreating(true); setIsEditing(true); setSelectedTemplate(null) }}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg mb-4"
          >
            + 新建模板
          </button>
          <TemplateList
            templates={templates}
            selectedTemplate={selectedTemplate}
            onSelect={(t) => { setSelectedTemplate(t); setIsEditing(false); setIsCreating(false) }}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* 右侧：编辑器 + 预览 */}
      <div className="flex-1 overflow-y-auto">
        {isEditing || isCreating ? (
          <TemplateEditor
            template={selectedTemplate}
            onSave={handleSave}
            onCancel={() => { setIsEditing(false); setIsCreating(false) }}
          />
        ) : selectedTemplate ? (
          <TemplatePreview template={selectedTemplate} onEdit={() => setIsEditing(true)} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            选择一个模板或创建新模板
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 成功标准

### 功能验收
- [ ] 用户可以在 /settings/templates 页面查看所有模板
- [ ] 用户可以创建新模板（填写表单 → 保存 → 列表刷新）
- [ ] 用户可以编辑现有模板（点击编辑 → 修改 → 保存）
- [ ] 用户可以删除模板（点击删除 → 确认 → 列表刷新）
- [ ] 用户可以启用/禁用模板（切换开关 → 状态更新）
- [ ] 产品生成流程使用数据库模板（创建产品 → 验证提示词来源）

### 技术验收
- [ ] 数据库迁移成功执行（5 个初始模板存在）
- [ ] 所有 API 端点返回正确状态码和数据格式
- [ ] 后端测试覆盖率 ≥ 80%
- [ ] 前端测试通过（npm test）
- [ ] 代码遵循不可变性原则（无直接修改对象）
- [ ] 无 console.log 残留
- [ ] TypeScript 类型检查通过（npm run type-check）

### 性能验收
- [ ] 模板列表加载时间 < 500ms
- [ ] 保存操作响应时间 < 1s
- [ ] 页面无明显卡顿或闪烁

---

## 风险和缓解措施

### 风险 1: 数据迁移失败
**影响**: 现有模板丢失，产品生成流程中断  
**缓解**: 
- 保留 TEMPLATES 字典作为 fallback
- 迁移脚本包含回滚逻辑
- 迁移前备份数据库

### 风险 2: API 接口不兼容
**影响**: 前端调用失败，现有功能受影响  
**缓解**:
- 保持 GET /api/products/templates 接口不变
- 新增端点使用不同路径（/api/templates）
- 充分的集成测试

### 风险 3: 前端状态管理复杂
**影响**: 编辑/创建状态混乱，用户体验差  
**缓解**:
- 使用清晰的状态标志（isEditing, isCreating）
- 每个操作后重置状态
- 添加加载和错误状态提示

---

## 后续优化（不在本计划范围）

- 模板版本控制（保存历史版本）
- 模板分类和标签系统
- 模板导入/导出功能（JSON 格式）
- 模板使用统计（哪些模板最常用）
- 批量操作（批量启用/禁用）
- 模板权限管理（不同用户可见不同模板）

---

## 开放问题

记录到 `/Users/shane/projects/tiktok-analyzer/.omc/plans/open-questions.md`:

1. **模板删除策略**: 如果某个模板已被产品使用，是否允许删除？
   - 选项 A: 软删除（标记为 deleted，但保留数据）
   - 选项 B: 硬删除（直接删除，产品记录保留 template_name）
   - 建议: 选项 B（简单，产品已保存 template_name）

2. **模板变量验证**: 是否需要验证 prompt_text 中的占位符格式？
   - 选项 A: 前端正则验证（{xxx} 格式）
   - 选项 B: 后端 Pydantic 验证
   - 建议: 选项 A（用户体验更好）

3. **默认模板**: 是否需要标记某个模板为"默认"？
   - 影响: 创建产品时自动选择默认模板
   - 建议: 暂不实现，保持现有逻辑（用户手动选择）

---

## 实施顺序建议

1. **Day 1**: Phase 1（数据库层）+ Phase 2（API 层）
2. **Day 2**: Phase 3（前端路由）+ Phase 4（前端组件）
3. **Day 3**: Phase 5（集成测试）+ 手动测试 + Bug 修复

**总预计时间**: 2-3 天（假设全职开发）

---

## 交付物清单

### 后端
- [ ] `app/models/prompt_template.py` - 数据库模型
- [ ] `alembic/versions/xxxx_add_prompt_templates.py` - 迁移脚本
- [ ] `app/api/templates.py` - API 路由
- [ ] `app/schemas/template.py` - Pydantic schemas
- [ ] `tests/test_templates_api.py` - API 测试

### 前端
- [ ] `pages/TemplateManagementPage.tsx` - 主页面
- [ ] `components/TemplateList.tsx` - 模板列表组件
- [ ] `components/TemplateEditor.tsx` - 编辑器组件
- [ ] `components/TemplatePreview.tsx` - 预览组件
- [ ] `api/templates.ts` - API 调用函数
- [ ] `pages/__tests__/TemplateManagementPage.test.tsx` - 页面测试

### 文档
- [ ] `.omc/plans/open-questions.md` - 开放问题记录
- [ ] `README.md` 更新（添加模板管理功能说明）
