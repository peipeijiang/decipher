import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/layout/MainLayout'
import { Loader2, Check, Copy, Image as ImageIcon, Video, AlertCircle, ChevronDown, ChevronUp, Edit, Save, X } from 'lucide-react'
import {
  createProduct,
  getProduct,
  getProductProgress,
  getProductDocJson,
  getProductPrompts,
  triggerImageGeneration,
  triggerVideoGeneration,
  getProductImageUrl,
  getGeneratedImageUrl,
  updatePrompt,
  triggerBatchVideoGeneration,
  archiveProduct,
  rerunProduct,
  resumeProduct,
} from '../api/client'
import type { Product, ProductPrompt, ProductProgress, ProductDoc } from '../types/product'

const PIPELINE_STEPS = [
  { key: 'scrape', label: '抓取', icon: '📦', desc: '商品信息' },
  { key: 'doc', label: '文档', icon: '📄', desc: '结构化' },
  { key: 'prompts', label: '提示词', icon: '✍️', desc: '生成中' },
  { key: 'image', label: '图片', icon: '🖼️', desc: '待生成' },
  { key: 'video', label: '视频', icon: '🎬', desc: '待生成' },
]

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [progress, setProgress] = useState<ProductProgress | null>(null)
  const [doc, setDoc] = useState<ProductDoc | null>(null)
  const [prompts, setPrompts] = useState<ProductPrompt[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [gridLayout, setGridLayout] = useState<'single' | '2x3' | '3x2'>('single')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [batchGenerating, setBatchGenerating] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(false)

  const fetchProduct = useCallback(async (isInitial = false) => {
    if (!id) return
    if (isInitial) setLoadingProduct(true)
    try {
      const p = await getProduct(id)
      setProduct(p)
      setLoadError(null)
      const prog = await getProductProgress(id)
      setProgress(prog)

      if (p.status === 'completed' || p.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (p.status === 'completed') {
          try { setDoc(await getProductDocJson(id)) } catch { /* no doc yet */ }
          try { setPrompts(await getProductPrompts(id)) } catch { /* no prompts yet */ }
        }
      } else if (prog.prompts >= 100) {
        try { setPrompts(await getProductPrompts(id)) } catch { /* ignore */ }
        if (prog.doc >= 100) {
          try { setDoc(await getProductDocJson(id)) } catch { /* ignore */ }
        }
      } else if (prog.doc >= 100) {
        try { setDoc(await getProductDocJson(id)) } catch { /* ignore */ }
      }
    } catch (e: any) {
      if (isInitial) {
        const msg = e?.response?.data?.detail || e?.message || '加载产品失败'
        setLoadError(msg)
      }
      // ignore subsequent polling errors silently
    } finally {
      if (isInitial) setLoadingProduct(false)
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    fetchProduct(true)
    pollRef.current = setInterval(() => fetchProduct(false), 2000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [id, fetchProduct])

  const handleCreate = async () => {
    if (!url.trim()) return
    setCreating(true)
    try {
      const p = await createProduct(url.trim())
      if ((p as any).existed) {
        if (confirm('该商品已存在，是否跳转到已有记录？')) {
          navigate(`/product/${p.id}`)
        }
      } else {
        navigate(`/product/${p.id}`)
      }
    } catch (e: any) {
      alert('创建失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setCreating(false)
    }
  }

  const getStepProgress = (key: string): 'pending' | 'active' | 'completed' | 'failed' => {
    if (!progress) return 'pending'
    if (product?.status === 'failed') {
      if (key === 'scrape' && progress.scrape < 100) return 'failed'
      if (key === 'doc' && progress.doc < 100 && progress.scrape >= 100) return 'failed'
      if (key === 'prompts' && progress.prompts < 100 && progress.doc >= 100) return 'failed'
    }
    if (key === 'scrape') return progress.scrape >= 100 ? 'completed' : progress.scrape > 0 ? 'active' : 'pending'
    if (key === 'doc') return progress.doc >= 100 ? 'completed' : progress.doc > 0 ? 'active' : 'pending'
    if (key === 'prompts') return progress.prompts >= 100 ? 'completed' : progress.prompts > 0 ? 'active' : 'pending'
    if (key === 'image') {
      const hasAny = prompts.some(p => p.image_status === 'completed')
      const hasGenerating = prompts.some(p => p.image_status === 'generating')
      return hasAny ? 'completed' : hasGenerating ? 'active' : 'pending'
    }
    if (key === 'video') {
      const hasAny = prompts.some(p => p.video_status === 'completed')
      const hasGenerating = prompts.some(p => p.video_status === 'generating')
      return hasAny ? 'completed' : hasGenerating ? 'active' : 'pending'
    }
    return 'pending'
  }

  const getStepDetail = (key: string): string => {
    if (!progress) return ''
    if (key === 'scrape' && progress.scrape >= 100 && doc) return `${doc.images.length} 张图`
    if (key === 'doc' && progress.doc >= 100) return '已完成'
    if (key === 'prompts' && progress.prompts >= 100) return `${prompts.length}/10`
    if (key === 'image') {
      const done = prompts.filter(p => p.image_status === 'completed').length
      return done > 0 ? `${done}/${prompts.length}` : ''
    }
    if (key === 'video') {
      const done = prompts.filter(p => p.video_status === 'completed').length
      return done > 0 ? `${done}/${prompts.length}` : ''
    }
    return ''
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16">
        {/* Back button when viewing a product */}
        {id && (
          <button
            onClick={() => navigate('/product/history')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <span>←</span> 返回产品列表
          </button>
        )}

        {/* Loading State */}
        {id && loadingProduct && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-sm text-gray-600">加载产品信息...</p>
          </div>
        )}

        {/* Error State */}
        {id && loadError && !loadingProduct && (
          <div className="flex flex-col items-center justify-center py-24">
            <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
            <p className="text-sm text-gray-600 mb-4">{loadError}</p>
            <button
              onClick={() => navigate('/product/history')}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              返回列表
            </button>
          </div>
        )}

        {/* URL Input - Only show when creating new product (no id) */}
        {!id && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-gray-900">产品视频生成</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">输入商品链接，自动抓取 → 分析 → 生成提示词 → 生成图片/视频</p>
            <div className="flex gap-3">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="粘贴商品链接（如 Amazon、1688、淘宝…）"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                disabled={creating}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !url.trim()}
                className="px-6 py-3 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {creating ? '创建中…' : '开始分析'}
              </button>
            </div>
          </div>
        )}

        {/* Product Detail View - Only show when id exists and loaded successfully */}
        {id && !loadingProduct && !loadError && product && (
          <>
            {/* Header with Archive Button */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{product.title || '产品详情'}</h1>
                <button
                  onClick={async () => {
                    await archiveProduct(product.id)
                    navigate('/product/history')
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  归档项目
                </button>
              </div>
              <p className="text-xs text-gray-400 truncate">{product.url}</p>
            </div>

            {/* Kanban Pipeline */}
            <div className="mb-8">
            {product.status === 'failed' && progress?.error && (
              <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {progress.error}
              </div>
            )}
            <div className="grid grid-cols-5 gap-3">
              {PIPELINE_STEPS.map(step => {
                const status = getStepProgress(step.key)
                const detail = getStepDetail(step.key)
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl border p-4 text-center transition-all ${
                      status === 'completed' ? 'bg-green-50 border-green-200' :
                      status === 'active' ? 'bg-blue-50 border-blue-200' :
                      status === 'failed' ? 'bg-red-50 border-red-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="text-2xl mb-1">{step.icon}</div>
                    <div className="text-xs font-semibold text-gray-800 mb-0.5">{step.label}</div>
                    {status === 'active' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mx-auto" />}
                    {status === 'completed' && <Check className="w-3.5 h-3.5 text-green-500 mx-auto" />}
                    {status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500 mx-auto" />}
                    {detail && <div className="text-[10px] text-gray-500 mt-1">{detail}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Rerun/Resume Buttons */}
          {product && (product.status === 'completed' || product.status === 'failed') && (
            <div className="flex gap-3 mb-6">
              <button
                onClick={async () => {
                  await rerunProduct(product.id)
                  window.location.reload()
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                重新运行
              </button>
              {product.status === 'failed' && (
                <button
                  onClick={async () => {
                    await resumeProduct(product.id)
                    window.location.reload()
                  }}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                >
                  继续运行
                </button>
              )}
            </div>
          )}

          {/* Product Info Section */}
          {doc && progress && progress.scrape >= 100 && (
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Product Images */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-800">商品图片</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">共 {doc.images.length} 张</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {doc.images.map(img => (
                  <div key={img.index} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                    <img
                      src={getProductImageUrl(id!, img.filename)}
                      alt={`商品图 ${img.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Product Doc */}
            <div>
              <h2 className="text-sm font-semibold text-gray-800 mb-3">商品文档</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">标题</div>
                  <div className="text-gray-800">{doc.title}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">描述</div>
                  <div className="text-gray-700 text-xs leading-relaxed">{doc.description}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">外观</div>
                  <div className="text-gray-700 text-xs leading-relaxed">{doc.appearance}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">使用场景</div>
                  <div className="text-gray-700 text-xs leading-relaxed">{doc.usage}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1">卖点</div>
                  <div className="text-gray-700 text-xs leading-relaxed">{doc.selling_points}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image Analysis Results */}
        {doc && doc.images && doc.images.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">图片识别结果</h2>
            <div className="space-y-4">
              {doc.images.map(img => (
                <div key={img.index} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      <img
                        src={getProductImageUrl(id!, img.filename)}
                        alt={`图片 ${img.index}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">图片 {img.index}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{img.filename}</span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-blue-600 mb-1">🔍 基础识别</div>
                        <div className="text-gray-700 leading-relaxed">{img.basic_recognition}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-green-600 mb-1">📦 产品理解</div>
                        <div className="text-gray-700 leading-relaxed">{img.product_understanding}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-purple-600 mb-1">🎬 创意建议</div>
                        <div className="text-gray-700 leading-relaxed">{img.creative_usage}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PLACEHOLDER_PROMPTS */}

        {/* Prompt List Section */}
        {prompts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-800">生成的提示词</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompts.length} 个</span>
            </div>

            {/* Control Panel */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <select
                value={gridLayout}
                onChange={e => setGridLayout(e.target.value as any)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="single">单图模式</option>
                <option value="2x3">6宫格 2×3</option>
                <option value="3x2">6宫格 3×2</option>
              </select>
              <select
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
              <button
                onClick={async () => {
                  if (!product) return
                  setBatchGenerating(true)
                  try {
                    await triggerBatchVideoGeneration(product.id)
                    alert('批量视频生成已启动')
                  } finally {
                    setBatchGenerating(false)
                  }
                }}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40"
                disabled={batchGenerating}
              >
                {batchGenerating ? '批量生成中...' : '批量生成视频'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prompts.map(prompt => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onUpdate={async () => {
                    if (id) {
                      try { setPrompts(await getProductPrompts(id)) } catch { /* ignore */ }
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </MainLayout>
  )
}

function PromptCard({ prompt, onUpdate }: { prompt: ProductPrompt; onUpdate: () => void }) {
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState<'image' | 'video' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(prompt.prompt_text)
  const [saving, setSaving] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.prompt_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleEdit = () => {
    setEditText(prompt.prompt_text)
    setEditing(true)
    setExpanded(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePrompt(prompt.id, editText)
      setEditing(false)
      onUpdate()
    } catch (e: any) {
      alert('保存失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditText(prompt.prompt_text)
    setEditing(false)
  }

  const handleGenerateImage = async () => {
    setGenerating('image')
    try {
      await triggerImageGeneration(prompt.id)
      alert('图片生成已启动，请稍候刷新查看')
    } catch (e: any) {
      alert('启动失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setGenerating(null)
    }
  }

  const handleGenerateVideo = async () => {
    setGenerating('video')
    try {
      await triggerVideoGeneration(prompt.id)
      alert('视频生成已启动，请稍候刷新查看')
    } catch (e: any) {
      alert('启动失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setGenerating(null)
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已完成</span>
    if (status === 'generating') return <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" />生成中</span>
    if (status === 'failed') return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">失败</span>
    return null
  }

  const shouldTruncate = prompt.prompt_text.length > 100
  const displayText = expanded || !shouldTruncate ? prompt.prompt_text : prompt.prompt_text.slice(0, 100) + '...'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800">变体 {prompt.variant_index}</span>
          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompt.template_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEdit}
            disabled={editing}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors disabled:opacity-40"
          >
            <Edit className="w-3 h-3" />
            编辑
          </button>
          <button
            onClick={handleCopy}
            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mb-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full text-xs text-gray-700 leading-relaxed border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            style={{ minHeight: '100px' }}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              保存
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <X className="w-3 h-3" />
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-700 leading-relaxed mb-2 whitespace-pre-wrap">
            {displayText}
          </p>
          {shouldTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 mb-3 transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  展开
                </>
              )}
            </button>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleGenerateImage}
          disabled={generating === 'image' || prompt.image_status === 'generating'}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {generating === 'image' || prompt.image_status === 'generating' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImageIcon className="w-3.5 h-3.5" />
          )}
          生成图片
        </button>
        <button
          onClick={handleGenerateVideo}
          disabled={generating === 'video' || prompt.video_status === 'generating'}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {generating === 'video' || prompt.video_status === 'generating' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Video className="w-3.5 h-3.5" />
          )}
          生成视频
        </button>
      </div>

      <div className="flex gap-2 mt-2">
        {getStatusBadge(prompt.image_status)}
        {getStatusBadge(prompt.video_status)}
      </div>

      {prompt.image_url && prompt.image_status === 'completed' && (
        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
          <img src={getGeneratedImageUrl(prompt.id)} alt="生成的图片" className="w-full" />
        </div>
      )}
    </div>
  )
}

