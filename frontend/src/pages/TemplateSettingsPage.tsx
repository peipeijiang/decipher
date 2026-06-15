import { useEffect, useState } from 'react'
import { MainLayout } from '../components/layout/MainLayout'
import { Plus, Edit2, Trash2, X, Film, Image as ImageIcon, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api/client'

// ── Types ──────────────────────────────────────────────────
interface VideoTemplate {
  id: string; key: string; name: string; structure: string
  has_builtin_hook: boolean; is_custom: boolean; is_active: boolean; created_at: string
}
interface ImageLayoutTemplate {
  id: string; key: string; name: string; prompt_template: string
  is_custom: boolean; is_active: boolean; created_at: string
}
interface HookTemplate {
  id: string; key: string; name: string; description: string; examples: string
  is_custom: boolean; is_active: boolean; created_at: string
}

// ── Toggle (amber) ─────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-500 ${
        checked ? 'bg-amber-500' : 'bg-gray-300'
      }`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-500 ${
        checked ? 'translate-x-5' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ── Status tags ────────────────────────────────────────────
function StatusTags({ isCustom, isActive }: { isCustom: boolean; isActive: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`tag ${isCustom ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
        {isCustom ? 'Custom' : 'Built-in'}
      </span>
      <span className={`tag ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
        {isActive ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  )
}

// ── Expandable content ─────────────────────────────────────
function Expandable({ content, preview, mono }: { content: string; preview: string; mono?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="cursor-pointer" onClick={() => setOpen(v => !v)}>
      {open ? (
        <pre className={`text-xs text-gray-600 mt-2 whitespace-pre-wrap bg-gray-50 rounded-xl p-3.5 max-h-80 overflow-y-auto leading-relaxed ${
          mono ? 'font-mono' : ''
        }`}>{content}</pre>
      ) : (
        <p className={`text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed ${mono ? 'font-mono' : ''}`}>{preview}</p>
      )}
      <span className="text-[10px] text-amber-600 font-medium mt-1.5 inline-flex items-center gap-1">
        {open ? <><ChevronUp className="w-3 h-3" />收起</> : <><ChevronDown className="w-3 h-3" />查看全部</>}
      </span>
    </div>
  )
}

// ═══ VIDEO CARD ═══════════════════════════════════════════
function VideoCard({ template, onToggle, onRefresh, onEdit, onDelete }: {
  template: VideoTemplate; onToggle: () => void; onRefresh: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className={`card p-5 flex flex-col gap-3.5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
      !template.is_active ? 'opacity-50' : ''
    }`}>
      {/* header row */}
      <div className="flex items-start justify-between gap-2">
        <StatusTags isCustom={template.is_custom} isActive={template.is_active} />
        <Toggle checked={template.is_active} onChange={onToggle} />
      </div>

      {/* title + content */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <h3 className="font-semibold text-gray-900 text-[15px] tracking-tight">{template.name}</h3>
          {template.has_builtin_hook && (
            <span className="tag bg-amber-50 text-amber-700 text-[9px]">自带开场白</span>
          )}
        </div>
        <p className="text-xs text-gray-400 font-mono">{template.key}</p>
        <Expandable
          content={template.structure}
          preview={template.structure.slice(0, 150).replace(/\n/g, ' ') + '…'}
          mono
        />
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer mr-auto select-none">
          <button type="button" onClick={async (e) => { e.stopPropagation()
            try { await api.patch(`/api/templates/video/${template.id}`, { has_builtin_hook: !template.has_builtin_hook }); onRefresh() } catch {}
          }}
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-300 ${
            template.has_builtin_hook ? 'bg-amber-400' : 'bg-gray-200'
          }`}>
            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-300 ${
              template.has_builtin_hook ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
          内置开场白
        </label>
        {template.is_custom ? (
          <>
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer">
              <Edit2 className="w-3 h-3" />编辑
            </button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
              <Trash2 className="w-3 h-3" />删除
            </button>
          </>
        ) : (
          <span className="text-[10px] text-gray-400 px-2">内置模板</span>
        )}
      </div>
    </div>
  )
}

// ═══ IMAGE LAYOUT CARD ═════════════════════════════════════
function ImageCard({ template, onToggle, onEdit, onDelete }: {
  template: ImageLayoutTemplate; onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className={`card p-5 flex flex-col gap-3.5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
      !template.is_active ? 'opacity-50' : ''
    }`}>
      <div className="flex items-start justify-between gap-2">
        <StatusTags isCustom={template.is_custom} isActive={template.is_active} />
        <Toggle checked={template.is_active} onChange={onToggle} />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-[15px] tracking-tight mb-0.5">{template.name}</h3>
        <p className="text-xs text-gray-400 font-mono">{template.key}</p>
        <Expandable
          content={template.prompt_template}
          preview={template.prompt_template.slice(0, 150).replace(/\n/g, ' ') + '…'}
          mono
        />
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        {template.is_custom ? (
          <>
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer">
              <Edit2 className="w-3 h-3" />编辑
            </button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
              <Trash2 className="w-3 h-3" />删除
            </button>
          </>
        ) : (
          <span className="text-[10px] text-gray-400 px-2">内置模板</span>
        )}
      </div>
    </div>
  )
}

// ═══ HOOK CARD ═════════════════════════════════════════════
function HookCard({ template, onToggle, onEdit, onDelete }: {
  template: HookTemplate; onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  let examples: string[] = []
  try { examples = JSON.parse(template.examples) } catch { examples = [template.examples] }

  return (
    <div className={`card p-5 flex flex-col gap-3.5 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
      !template.is_active ? 'opacity-50' : ''
    }`}>
      <div className="flex items-start justify-between gap-2">
        <StatusTags isCustom={template.is_custom} isActive={template.is_active} />
        <Toggle checked={template.is_active} onChange={onToggle} />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-[15px] tracking-tight mb-0.5">{template.name}</h3>
        <p className="text-xs text-gray-400 font-mono">{template.key}</p>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{template.description}</p>
        <div className="cursor-pointer mt-2" onClick={() => setExpanded(v => !v)}>
          {expanded ? (
            <div className="bg-gray-50 rounded-xl p-3.5 space-y-1 mt-2">
              {examples.map((ex, i) => (
                <p key={i} className="text-xs text-gray-600 italic leading-relaxed">"{ex}"</p>
              ))}
            </div>
          ) : examples.length > 0 ? (
            <p className="text-xs text-gray-400 italic line-clamp-1">"{examples[0]}"</p>
          ) : null}
          <span className="text-[10px] text-amber-600 font-medium mt-1.5 inline-flex items-center gap-1">
            {expanded ? <><ChevronUp className="w-3 h-3" />收起示例</> : <><ChevronDown className="w-3 h-3" />查看{examples.length}个示例</>}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        {template.is_custom ? (
          <>
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer">
              <Edit2 className="w-3 h-3" />编辑
            </button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer">
              <Trash2 className="w-3 h-3" />删除
            </button>
          </>
        ) : (
          <span className="text-[10px] text-gray-400 px-2">内置模板</span>
        )}
      </div>
    </div>
  )
}

// ── Add card ───────────────────────────────────────────────
function AddCard({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="card flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-amber-500 transition-all duration-500 p-5 cursor-pointer min-h-[160px] group"
    >
      <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center group-hover:bg-amber-50 group-hover:scale-110 transition-all duration-500">
        <Plus className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

// ── Section header (with eyebrow pill) ─────────────────────
function SectionHeader({ icon, title, count }: {
  icon: React.ReactNode; title: string; count: number
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{count} 个模板</p>
        </div>
      </div>
    </div>
  )
}

// ── Modal shell (glass overlay, double-bezel card) ─────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-scaleIn"
      onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

// ═══ VIDEO MODAL ═══════════════════════════════════════════
function VideoModal({ editing, onClose, onSaved }: {
  editing: VideoTemplate | null; onClose: () => void; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const h = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true); setError('')
    const fd = new FormData(e.currentTarget)
    try {
      if (editing) await api.patch(`/api/templates/video/${editing.id}`, { name: fd.get('name'), structure: fd.get('structure') })
      else await api.post('/api/templates/video', { key: fd.get('key'), name: fd.get('name'), structure: fd.get('structure'), is_active: true })
      onSaved(); onClose()
    } catch { setError('保存失败，请重试') } finally { setSaving(false) }
  }
  return (
    <ModalShell title={editing ? '编辑视频风格模板' : '新建视频风格模板'} onClose={onClose}>
      <form onSubmit={h} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">标识符 (Key)</label>
          <input type="text" name="key" defaultValue={editing?.key ?? ''} disabled={!!editing} required
            placeholder="例如: my-style"
            className="input w-full px-4 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
          <p className="text-xs text-gray-400 mt-1">唯一标识符，创建后不可修改</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">显示名称</label>
          <input type="text" name="name" defaultValue={editing?.name ?? ''} required
            placeholder="例如: 我的自定义风格" className="input w-full px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">结构模板</label>
          <div className="mb-3 p-3 bg-amber-50 rounded-2xl flex gap-2.5"
            style={{ boxShadow: '0 0 0 1px rgba(217,119,6,0.1)' }}>
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              可用占位符：<code className="bg-amber-100 px-1.5 py-0.5 rounded-md text-amber-800">{'{hook}'}</code>、
              <code className="bg-amber-100 px-1.5 py-0.5 rounded-md text-amber-800">{'{content}'}</code>、
              <code className="bg-amber-100 px-1.5 py-0.5 rounded-md text-amber-800">{'{consistency}'}</code>
            </p>
          </div>
          <textarea name="structure" defaultValue={editing?.structure ?? ''} required rows={12}
            placeholder="输入视频结构模板..."
            className="input w-full px-4 py-3 text-sm font-mono resize-none" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-pill btn-pill-secondary text-sm py-2 cursor-pointer">取消</button>
          <button type="submit" disabled={saving}
            className="btn-pill btn-pill-primary text-sm py-2 cursor-pointer disabled:opacity-50">
            {saving ? '保存中…' : editing ? '保存修改' : '创建模板'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ═══ IMAGE LAYOUT MODAL ════════════════════════════════════
function ImageModal({ editing, onClose, onSaved }: {
  editing: ImageLayoutTemplate | null; onClose: () => void; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const h = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true); setError('')
    const fd = new FormData(e.currentTarget)
    try {
      if (editing) await api.patch(`/api/templates/image-layout/${editing.id}`, { name: fd.get('name'), prompt_template: fd.get('prompt_template') })
      else await api.post('/api/templates/image-layout', { key: fd.get('key'), name: fd.get('name'), prompt_template: fd.get('prompt_template'), is_active: true })
      onSaved(); onClose()
    } catch { setError('保存失败，请重试') } finally { setSaving(false) }
  }
  return (
    <ModalShell title={editing ? '编辑图片布局模板' : '新建图片布局模板'} onClose={onClose}>
      <form onSubmit={h} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">标识符 (Key)</label>
          <input type="text" name="key" defaultValue={editing?.key ?? ''} disabled={!!editing} required
            placeholder="例如: my-layout" className="input w-full px-4 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">显示名称</label>
          <input type="text" name="name" defaultValue={editing?.name ?? ''} required
            placeholder="例如: 我的布局" className="input w-full px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">提示词模板</label>
          <textarea name="prompt_template" defaultValue={editing?.prompt_template ?? ''} required rows={12}
            placeholder="输入图片布局提示词模板..."
            className="input w-full px-4 py-3 text-sm font-mono resize-none" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-pill btn-pill-secondary text-sm py-2 cursor-pointer">取消</button>
          <button type="submit" disabled={saving} className="btn-pill btn-pill-primary text-sm py-2 cursor-pointer disabled:opacity-50">
            {saving ? '保存中…' : editing ? '保存修改' : '创建模板'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ═══ HOOK MODAL ════════════════════════════════════════════
function HookModal({ editing, onClose, onSaved }: {
  editing: HookTemplate | null; onClose: () => void; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const getDef = () => { if(!editing)return''; try{ const a=JSON.parse(editing.examples); return Array.isArray(a)?a.join('\n'):editing.examples }catch{return editing.examples} }
  const h = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true); setError('')
    const fd = new FormData(e.currentTarget)
    const raw = (fd.get('examples') as string).trim(); const arr = raw.split('\n').map(s=>s.trim()).filter(Boolean)
    try {
      if (editing) await api.patch(`/api/templates/hook/${editing.id}`, { name: fd.get('name'), description: fd.get('description'), examples: JSON.stringify(arr) })
      else await api.post('/api/templates/hook', { key: fd.get('key'), name: fd.get('name'), description: fd.get('description'), examples: JSON.stringify(arr) })
      onSaved(); onClose()
    } catch { setError('保存失败，请重试') } finally { setSaving(false) }
  }
  return (
    <ModalShell title={editing ? '编辑开场白模板' : '新建开场白模板'} onClose={onClose}>
      <form onSubmit={h} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">标识符 (Key)</label>
          <input type="text" name="key" defaultValue={editing?.key ?? ''} disabled={!!editing} required
            placeholder="例如: my-hook" className="input w-full px-4 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400" />
        </div>
        <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">名称</label>
          <input type="text" name="name" defaultValue={editing?.name ?? ''} required
            placeholder="例如: Pain Point Solution" className="input w-full px-4 py-2.5 text-sm" /></div>
        <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">策略描述</label>
          <textarea name="description" defaultValue={editing?.description ?? ''} required rows={3}
            placeholder="描述这个 Hook 策略的核心思路..."
            className="input w-full px-4 py-3 text-sm resize-none" /></div>
        <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">示例句式</label>
          <p className="text-xs text-gray-400 mb-1.5">每行一个示例</p>
          <textarea name="examples" defaultValue={getDef()} required rows={5}
            placeholder={"示例1\n示例2"} className="input w-full px-4 py-3 text-sm resize-none" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="btn-pill btn-pill-secondary text-sm py-2 cursor-pointer">取消</button>
          <button type="submit" disabled={saving} className="btn-pill btn-pill-primary text-sm py-2 cursor-pointer disabled:opacity-50">
            {saving ? '保存中…' : editing ? '保存修改' : '创建模板'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ═══ PAGE ═══════════════════════════════════════════════════
type ActiveModal = { type:'create-video' } | { type:'edit-video'; template:VideoTemplate }
  | { type:'create-image' } | { type:'edit-image'; template:ImageLayoutTemplate }
  | { type:'create-hook' } | { type:'edit-hook'; template:HookTemplate } | null

export default function TemplateSettingsPage() {
  const [vt, setVt] = useState<VideoTemplate[]>([])
  const [it, setIt] = useState<ImageLayoutTemplate[]>([])
  const [ht, setHt] = useState<HookTemplate[]>([])
  const [ld, setLd] = useState(true)
  const [m, setM] = useState<ActiveModal>(null)

  const load = async () => {
    try { const [vr,ir,hr] = await Promise.all([api.get<VideoTemplate[]>('/api/templates/video'), api.get<ImageLayoutTemplate[]>('/api/templates/image-layout'), api.get<HookTemplate[]>('/api/templates/hook')])
      setVt(vr.data); setIt(ir.data); setHt(hr.data) } catch {} finally { setLd(false) }
  }
  useEffect(()=>{load()},[])

  const tV = async (t:VideoTemplate) => { try{await api.patch(`/api/templates/video/${t.id}`,{is_active:!t.is_active});await load()}catch{} }
  const tI = async (t:ImageLayoutTemplate) => { try{await api.patch(`/api/templates/image-layout/${t.id}`,{is_active:!t.is_active});await load()}catch{} }
  const tH = async (t:HookTemplate) => { try{await api.patch(`/api/templates/hook/${t.id}`,{is_active:!t.is_active});await load()}catch{} }
  const dV = async (t:VideoTemplate) => { if(!confirm(`确定删除模板 "${t.name}"？`))return; try{await api.delete(`/api/templates/video/${t.id}`);await load()}catch{} }
  const dI = async (t:ImageLayoutTemplate) => { if(!confirm(`确定删除模板 "${t.name}"？`))return; try{await api.delete(`/api/templates/image-layout/${t.id}`);await load()}catch{} }
  const dH = async (t:HookTemplate) => { if(!confirm(`确定删除模板 "${t.name}"？`))return; try{await api.delete(`/api/templates/hook/${t.id}`);await load()}catch{} }

  if (ld) return (<MainLayout><div className="flex items-center justify-center h-64"><p className="text-sm text-gray-400">加载中…</p></div></MainLayout>)

  return (
    <MainLayout>
      {/* ═══ ATTENTION ═══ */}
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-32 animate-fadeIn">

        <section className="mb-24">
          <div className="max-w-3xl">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] bg-amber-50 text-amber-700 mb-4">
              Settings
            </span>
            <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-bold text-gray-900 tracking-tight leading-[1.1]"
              style={{ letterSpacing: '-0.04em' }}>
              模板管理
            </h1>
            <p className="text-base text-gray-500 mt-3 max-w-xl leading-relaxed">
              管理视频风格模板、图片布局模板和 Hook 策略模板 — 自定义你的内容生成流水线
            </p>
          </div>
        </section>

        {/* ═══ INTEREST: Template sections ═══ */}
        <div className="space-y-20">
          {/* Video templates */}
          <section>
            <SectionHeader icon={<Film className="w-5 h-5" />} title="视频风格模板" count={vt.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {vt.map(t => <VideoCard key={t.id} template={t} onToggle={()=>tV(t)} onRefresh={load} onEdit={()=>setM({type:'edit-video',template:t})} onDelete={()=>dV(t)} />)}
              <AddCard onClick={()=>setM({type:'create-video'})} label="新增视频模板" />
            </div>
          </section>

          {/* Image layout templates */}
          <section>
            <SectionHeader icon={<ImageIcon className="w-5 h-5" />} title="图片布局模板" count={it.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {it.map(t => <ImageCard key={t.id} template={t} onToggle={()=>tI(t)} onEdit={()=>setM({type:'edit-image',template:t})} onDelete={()=>dI(t)} />)}
              <AddCard onClick={()=>setM({type:'create-image'})} label="新增布局模板" />
            </div>
          </section>

          {/* Hook templates */}
          <section>
            <SectionHeader icon={<Zap className="w-5 h-5" />} title="开场白模板" count={ht.length} />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {ht.map(t => <HookCard key={t.id} template={t} onToggle={()=>tH(t)} onEdit={()=>setM({type:'edit-hook',template:t})} onDelete={()=>dH(t)} />)}
              <AddCard onClick={()=>setM({type:'create-hook'})} label="新增 Hook 模板" />
            </div>
          </section>
        </div>
      </div>

      {/* Modals */}
      {m?.type==='create-video' && <VideoModal editing={null} onClose={()=>setM(null)} onSaved={load} />}
      {m?.type==='edit-video' && <VideoModal editing={m.template} onClose={()=>setM(null)} onSaved={load} />}
      {m?.type==='create-image' && <ImageModal editing={null} onClose={()=>setM(null)} onSaved={load} />}
      {m?.type==='edit-image' && <ImageModal editing={m.template} onClose={()=>setM(null)} onSaved={load} />}
      {m?.type==='create-hook' && <HookModal editing={null} onClose={()=>setM(null)} onSaved={load} />}
      {m?.type==='edit-hook' && <HookModal editing={m.template} onClose={()=>setM(null)} onSaved={load} />}
    </MainLayout>
  )
}
