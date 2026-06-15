import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Upload, FileText, Video, Image, GitBranch, Layers, Square, X, RotateCcw, Check, Filter, Eye, MousePointer, RefreshCw, Scan, BookOpen, Wand2, Zap, PenTool } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { getAgentPrompts, updateAgentPrompt, resetAgentPrompt } from '../api/client'
import type { AgentPrompt } from '../api/client'

// ── Node data ──────────────────────────────────────────────
interface WorkflowNodeData {
  label: string
  description: string
  icon: React.ReactNode
  agentKey?: string
  isEditable: boolean
  [key: string]: unknown
}

// ── Custom Node — wider, warm amber highlights ─────────────
function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData

  const borderClass = selected
    ? 'border-amber-500 shadow-amber'
    : 'border-gray-200 hover:border-amber-300'

  const bgClass = nodeData.isEditable
    ? 'bg-white'
    : 'bg-amber-50'

  return (
    <div
      className={`rounded-xl border-2 px-5 py-4 w-56 transition-all cursor-pointer ${borderClass} ${bgClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-2.5 !h-2.5" />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
          nodeData.isEditable ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {nodeData.icon as React.ReactNode}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 leading-tight">{nodeData.label}</p>
          <p className="text-[11px] text-gray-400 mt-1 leading-tight">{nodeData.description}</p>
        </div>
        {nodeData.isEditable && (
          <span className="text-[10px] text-amber-600 font-medium">点击编辑</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-2.5 !h-2.5" />
    </div>
  )
}

const nodeTypes = { workflow: WorkflowNode }

// ── Node positions — wider gaps, more breathing room ──────
const GX = 280 // horizontal gap

const INITIAL_NODES: Node<WorkflowNodeData>[] = [
  { id: 'scrape', type: 'workflow', position: { x: -40, y: 250 },
    data: { label: '产品页面爬取', description: '输入URL，爬取产品图片', icon: <Upload className="w-5 h-5" />, isEditable: false } },
  { id: 'product_image_analyzer', type: 'workflow', position: { x: GX, y: 250 },
    data: { label: '产品图片分析', description: '3层AI识别', icon: <Scan className="w-5 h-5" />, agentKey: 'product_image_analyzer', isEditable: true } },
  { id: 'image_filter', type: 'workflow', position: { x: GX * 2, y: 250 },
    data: { label: '图片过滤', description: '过滤非产品图片', icon: <Filter className="w-5 h-5" />, agentKey: 'image_filter', isEditable: true } },
  { id: 'product_appearance_extractor', type: 'workflow', position: { x: GX * 3, y: 100 },
    data: { label: '产品外观提取', description: '从图片提取外观描述', icon: <Eye className="w-5 h-5" />, agentKey: 'product_appearance_extractor', isEditable: true } },
  { id: 'reference_image_picker', type: 'workflow', position: { x: GX * 3, y: 400 },
    data: { label: '参考图选择', description: '选最佳参考图', icon: <MousePointer className="w-5 h-5" />, agentKey: 'reference_image_picker', isEditable: true } },
  { id: 'product_doc_generator', type: 'workflow', position: { x: GX * 4, y: 250 },
    data: { label: '产品文档生成', description: '生成结构化产品描述', icon: <FileText className="w-5 h-5" />, agentKey: 'product_doc_generator', isEditable: true } },
  { id: 'instruction_board_generator', type: 'workflow', position: { x: GX * 5, y: 100 },
    data: { label: '说明书生成', description: '生成产品使用说明图', icon: <BookOpen className="w-5 h-5" />, agentKey: 'instruction_board_generator', isEditable: true } },
  { id: 'video_script_generator', type: 'workflow', position: { x: GX * 5, y: 400 },
    data: { label: '视频脚本生成', description: '基于产品文档生成脚本', icon: <Video className="w-5 h-5" />, agentKey: 'video_script_generator', isEditable: true } },
  { id: 'prompt_refiner', type: 'workflow', position: { x: GX * 6, y: 100 },
    data: { label: '提示词优化', description: '根据用户指令优化脚本', icon: <Wand2 className="w-5 h-5" />, agentKey: 'prompt_refiner', isEditable: true } },
  { id: 'hook_picker', type: 'workflow', position: { x: GX * 6, y: 300 },
    data: { label: 'Hook策略选择', description: '自动选择最佳开场', icon: <Zap className="w-5 h-5" />, agentKey: 'hook_picker', isEditable: true } },
  { id: 'single_prompt_regenerator', type: 'workflow', position: { x: GX * 6, y: 500 },
    data: { label: '单条脚本重生成', description: '重新生成单条视频脚本', icon: <PenTool className="w-5 h-5" />, agentKey: 'single_prompt_regenerator', isEditable: true } },
  { id: 'image_prompt_branch', type: 'workflow', position: { x: GX * 6, y: 700 },
    data: { label: '图片提示词生成', description: '分发到各图片生成路径', icon: <GitBranch className="w-5 h-5" />, isEditable: false } },
  { id: 'storyboard_filler', type: 'workflow', position: { x: GX * 7, y: 250 },
    data: { label: '故事板填充', description: '生成故事板图片提示词', icon: <Layers className="w-5 h-5" />, agentKey: 'storyboard_filler', isEditable: true } },
  { id: 'multi_panel_storyboard', type: 'workflow', position: { x: GX * 7, y: 450 },
    data: { label: '多宫格分镜', description: '生成多宫格分镜提示词', icon: <Image className="w-5 h-5" />, agentKey: 'multi_panel_storyboard', isEditable: true } },
  { id: 'single_image_prompt', type: 'workflow', position: { x: GX * 7, y: 650 },
    data: { label: '单图提示词', description: '生成单张图片提示词', icon: <Square className="w-5 h-5" />, agentKey: 'single_image_prompt', isEditable: true } },
  { id: 'video_to_image_converter', type: 'workflow', position: { x: GX * 7, y: 850 },
    data: { label: '格式转换', description: '视频脚本转图片提示词', icon: <RefreshCw className="w-5 h-5" />, agentKey: 'video_to_image_converter', isEditable: true } },
]

const INITIAL_EDGES: Edge[] = [
  { id: 'e1', source: 'scrape', target: 'product_image_analyzer', animated: true },
  { id: 'e2', source: 'product_image_analyzer', target: 'image_filter', animated: true },
  { id: 'e3', source: 'image_filter', target: 'product_appearance_extractor' },
  { id: 'e4', source: 'image_filter', target: 'reference_image_picker' },
  { id: 'e5', source: 'product_appearance_extractor', target: 'product_doc_generator' },
  { id: 'e6', source: 'reference_image_picker', target: 'product_doc_generator' },
  { id: 'e7', source: 'product_doc_generator', target: 'instruction_board_generator' },
  { id: 'e8', source: 'product_doc_generator', target: 'video_script_generator' },
  { id: 'e9', source: 'video_script_generator', target: 'prompt_refiner' },
  { id: 'e10', source: 'video_script_generator', target: 'hook_picker' },
  { id: 'e11', source: 'video_script_generator', target: 'single_prompt_regenerator' },
  { id: 'e12', source: 'video_script_generator', target: 'image_prompt_branch' },
  { id: 'e13', source: 'image_prompt_branch', target: 'storyboard_filler' },
  { id: 'e14', source: 'image_prompt_branch', target: 'multi_panel_storyboard' },
  { id: 'e15', source: 'image_prompt_branch', target: 'single_image_prompt' },
  { id: 'e16', source: 'image_prompt_branch', target: 'video_to_image_converter' },
]

// ── Edit Panel ────────────────────────────────────────────
interface EditPanelProps {
  prompt: AgentPrompt
  onClose: () => void
  onUpdated: (p: AgentPrompt) => void
}

function HighlightedTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }
  return (
    <textarea
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3.5 py-3 text-sm text-gray-800 placeholder-gray-400 resize-y leading-relaxed focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-all font-mono"
      rows={8}
    />
  )
}

function EditPanel({ prompt, onClose, onUpdated }: EditPanelProps) {
  const [systemPrompt, setSystemPrompt] = useState(prompt.system_prompt)
  const [userPromptTemplate, setUserPromptTemplate] = useState(prompt.user_prompt_template)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const variables = (prompt.user_prompt_template.match(/\{\{(\w+)\}\}/g) || [])
    .map(v => v.replace(/[{}]/g, ''))

  const dirty = systemPrompt !== prompt.system_prompt || userPromptTemplate !== prompt.user_prompt_template

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccessMsg('')
    try {
      const updated = await updateAgentPrompt(prompt.id, {
        system_prompt: systemPrompt,
        user_prompt_template: userPromptTemplate,
      })
      onUpdated(updated)
      setSuccessMsg('保存成功')
      setTimeout(() => setSuccessMsg(''), 2500)
    } catch {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setError('')
    setSuccessMsg('')
    try {
      const updated = await resetAgentPrompt(prompt.id)
      onUpdated(updated)
      setSystemPrompt(updated.system_prompt)
      setUserPromptTemplate(updated.user_prompt_template)
      setSuccessMsg('已重置为默认')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch {
      setError('重置失败，请重试')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="w-[520px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-base font-semibold text-gray-900 tracking-tight">{prompt.name}</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{prompt.key}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          aria-label="关闭编辑面板"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <p className="text-sm text-gray-500">{prompt.description}</p>

        {variables.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">可用变量</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map(v => (
                <code key={v} className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-md font-mono font-medium">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">System Prompt</p>
          <HighlightedTextarea value={systemPrompt} onChange={setSystemPrompt} />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">User Prompt Template</p>
          <HighlightedTextarea
            value={userPromptTemplate}
            onChange={setUserPromptTemplate}
            placeholder="使用 {{变量名}} 引用动态数据"
          />
        </div>
      </div>

      {/* footer */}
      <div className="px-5 py-4 border-t border-gray-200">
        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}
        {successMsg && (
          <p className="text-sm text-emerald-600 mb-3 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {successMsg}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="btn btn-secondary text-sm px-4 py-2 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resetting ? '重置中…' : '重置默认'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              background: saving ? '#92400e' : '#d97706',
              boxShadow: '0 1px 3px rgba(217,119,6,0.25)',
            }}
            onMouseEnter={e => { if (!saving && dirty) (e.target as HTMLButtonElement).style.background = '#b45309' }}
            onMouseLeave={e => { if (!saving && dirty) (e.target as HTMLButtonElement).style.background = '#d97706' }}
          >
            <Check className="w-4 h-4" />
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────
export default function AgentWorkflowPage() {
  const [agentPrompts, setAgentPrompts] = useState<AgentPrompt[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<AgentPrompt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAgentPrompts()
      .then(setAgentPrompts)
      .finally(() => setLoading(false))
  }, [])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as unknown as WorkflowNodeData
      if (data.agentKey) {
        const prompt = agentPrompts.find(p => p.key === data.agentKey)
        if (prompt) setSelectedPrompt(prompt)
      }
    },
    [agentPrompts],
  )

  const handlePromptUpdated = (updated: AgentPrompt) => {
    setAgentPrompts(prev => prev.map(p => (p.id === updated.id ? updated : p)))
    setSelectedPrompt(updated)
  }

  return (
    <MainLayout>
      {/* Full-height canvas — fills viewport */}
      <div className="flex" style={{ height: 'calc(100vh)' }}>
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <span className="text-sm text-gray-500">加载中...</span>
            </div>
          )}
          <ReactFlow
            nodes={INITIAL_NODES}
            edges={INITIAL_EDGES}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.5 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            onNodeClick={handleNodeClick}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#d1cdc5" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {selectedPrompt && (
          <EditPanel
            key={selectedPrompt.id}
            prompt={selectedPrompt}
            onClose={() => setSelectedPrompt(null)}
            onUpdated={handlePromptUpdated}
          />
        )}
      </div>
    </MainLayout>
  )
}
