import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/layout/MainLayout'
import { TaskQueueSidebar } from '../components/TaskQueueSidebar'
import { Loader2, Check, Copy, Image as ImageIcon, Video, AlertCircle, ChevronDown, ChevronUp, Edit, Save, X, FileText, Lightbulb, ShieldAlert } from 'lucide-react'
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
  regeneratePrompt,
  triggerBatchVideoGeneration,
  archiveProduct,
  rerunProduct,
  resumeProduct,
  reanalyzeProductDoc,
  getVideoTemplates,
  getHookTemplates,
  getImageLayoutTemplates,
  generatePrompts,
  refinePrompt,
} from '../api/client'
import api from '../api/client'
import type { Product, ProductPrompt, ProductProgress, ProductDoc, VideoTemplate } from '../types/product'

const PIPELINE_STEPS = [
  { key: 'scrape', label: '抓取', desc: '爬取商品页面，提取图片与信息' },
  { key: 'doc', label: '文档', desc: 'AI 识别图片生成结构化文档' },
  { key: 'prompts', label: '提示词', desc: '按模板生成多条视频脚本' },
  { key: 'image', label: '图片', desc: 'AI 生成分镜图 / 产品图' },
  { key: 'video', label: '视频', desc: 'AI 生成最终营销短视频' },
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
  const [templates, setTemplates] = useState<VideoTemplate[]>([])
  const [hookTemplates, setHookTemplates] = useState<{ id: string; key: string; name: string }[]>([])
  const [imageLayoutTemplates, setImageLayoutTemplates] = useState<{ id: string; key: string; name: string }[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const promptPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const promptPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [manualPromptGenerating, setManualPromptGenerating] = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [taskQueueOpen, setTaskQueueOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(false)

  // Load templates on mount
  useEffect(() => {
    getVideoTemplates().then(setTemplates).catch(console.error)
    getHookTemplates().then(setHookTemplates).catch(console.error)
    getImageLayoutTemplates().then(setImageLayoutTemplates).catch(console.error)
  }, [])

  const stopPromptPolling = useCallback(() => {
    if (promptPollRef.current) {
      clearInterval(promptPollRef.current)
      promptPollRef.current = null
    }
    if (promptPollTimeoutRef.current) {
      clearTimeout(promptPollTimeoutRef.current)
      promptPollTimeoutRef.current = null
    }
    setManualPromptGenerating(false)
  }, [])

  const startPromptPolling = useCallback(() => {
    if (!id) return
    stopPromptPolling()
    setManualPromptGenerating(true)

    const poll = async () => {
      let latestProgress = progress?.prompts ?? 0
      let latestPromptCount = prompts.length

      try {
        const [progressResult, promptResult] = await Promise.allSettled([
          getProductProgress(id),
          getProductPrompts(id),
        ])

        if (progressResult.status === 'fulfilled') {
          setProgress(progressResult.value)
          latestProgress = progressResult.value.prompts
        }
        if (promptResult.status === 'fulfilled') {
          setPrompts(promptResult.value)
          latestPromptCount = promptResult.value.length
        }

        if ((latestProgress >= 100 && latestPromptCount > 0) || latestPromptCount >= 10) {
          stopPromptPolling()
        }
      } catch {
        // Transient failures can happen while the backend task is starting.
      }
    }

    void poll()
    promptPollRef.current = setInterval(poll, 1500)
    promptPollTimeoutRef.current = setTimeout(stopPromptPolling, 120000)
  }, [id, progress?.prompts, prompts.length, stopPromptPolling])

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
      stopPromptPolling()
    }
  }, [id, fetchProduct, stopPromptPolling])

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

  const getStepDetail = (key: string): string => {
    // Scrape: image count
    if (key === 'scrape') {
      const cnt = doc?.images?.length || 0
      if (cnt > 0) return `${cnt} 张商品图片`
      if (progress?.scrape && progress.scrape > 0) return '抓取中…'
      return ''
    }
    // Doc
    if (key === 'doc') {
      if (doc?.appearance) return '文档已生成'
      if (progress?.doc && progress.doc > 0) {
        const current = progress.doc_current || 0
        const total = progress.doc_total || 0
        const stage = progress.doc_stage || 'AI 分析中'
        if (total > 0) return `${stage} ${current}/${total} 张 · ${progress.doc}%`
        return `${stage} · ${progress.doc}%`
      }
      return ''
    }
    // Prompts
    if (key === 'prompts') {
      if (prompts.length > 0) {
        const imgCnt = prompts.filter(p => p.image_status === 'completed').length
        const vidCnt = prompts.filter(p => p.video_status === 'completed').length
        if (vidCnt > 0) return `${prompts.length} 条脚本 · ${vidCnt} 条视频`
        if (imgCnt > 0) return `${prompts.length} 条脚本 · ${imgCnt} 张图`
        return `${prompts.length} 条脚本`
      }
      if (progress?.prompts && progress.prompts > 0) return '生成中…'
      return ''
    }
    // Image
    if (key === 'image') {
      const cnt = prompts.filter(p => p.image_status === 'completed').length
      if (cnt > 0) return `${cnt} 张已生成`
      if (prompts.length > 0) return '等待生成'
      return ''
    }
    // Video
    if (key === 'video') {
      const cnt = prompts.filter(p => p.video_status === 'completed').length
      if (cnt > 0) return `${cnt} 条已生成`
      if (prompts.length > 0) return '等待生成'
      return ''
    }
    return ''
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

  const getStepPercent = (key: string): number => {
    if (!progress) return 0
    if (key === 'scrape') return progress.scrape
    if (key === 'doc') return progress.doc
    if (key === 'prompts') return progress.prompts
    if (key === 'image') {
      if (prompts.length === 0) return 0
      const completed = prompts.filter(p => p.image_status === 'completed').length
      const generating = prompts.filter(p => p.image_status === 'generating').length
      return Math.min(100, Math.round(((completed + generating * 0.35) / prompts.length) * 100))
    }
    if (key === 'video') {
      if (prompts.length === 0) return 0
      const completed = prompts.filter(p => p.video_status === 'completed').length
      const generating = prompts.filter(p => p.video_status === 'generating').length
      return Math.min(100, Math.round(((completed + generating * 0.35) / prompts.length) * 100))
    }
    return 0
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
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight tracking-tight">{product.title || 'Product'}</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="rounded-full bg-gray-50 border border-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500 font-mono truncate">{product.url}</span>
                    {product.status === 'completed' && (
                      <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-medium border border-emerald-100">Ready</span>
                    )}
                    {(product.status === 'scraping' || product.status === 'analyzing') && (
                      <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-[11px] font-medium border border-blue-100 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />Processing
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setTaskQueueOpen(v => !v)}
                    className="px-4 py-2 rounded-xl border border-gray-100 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm">
                    Queue
                  </button>
                  <button onClick={async () => { await archiveProduct(product.id); navigate('/product/history') }}
                    className="px-4 py-2 rounded-xl border border-gray-100 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm">
                    Archive
                  </button>
                </div>
              </div>
            </div>

            {/* Pipeline Progress */}
            <div className="mb-6">
            {product.status === 'failed' && progress?.error && (
              <div className="mb-3 flex items-center gap-2 text-xs text-red-700 bg-red-50/70 border border-red-100 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {progress.error}
              </div>
            )}
            <div className="flex items-stretch gap-1 bg-gray-50 rounded-xl p-2 overflow-x-auto">
              {PIPELINE_STEPS.map((step, idx) => {
                const status = getStepProgress(step.key)
                const detail = getStepDetail(step.key)
                const percent = getStepPercent(step.key)
                const isLast = idx === PIPELINE_STEPS.length - 1
                return (
                  <div key={step.key} className="flex items-center flex-1 min-w-0" title={step.desc}>
                    <div className={`flex flex-col justify-center px-3 py-2.5 rounded-xl flex-1 min-w-0 transition-all duration-300 ${
                      status === 'completed' ? 'bg-emerald-50 border border-emerald-100' :
                      status === 'active' ? 'bg-blue-50 border border-blue-100' :
                      status === 'failed' ? 'bg-red-50 border border-red-100' :
                      'bg-transparent'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          status === 'completed' ? 'bg-emerald-500 text-white' :
                          status === 'active' ? 'bg-blue-500 text-white animate-pulse' :
                          status === 'failed' ? 'bg-red-500 text-white' :
                          'bg-gray-200 text-gray-500'
                        }`}>
                          {status === 'completed' ? <Check className="w-3 h-3" /> :
                           status === 'active' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                           status === 'failed' ? <X className="w-3 h-3" /> :
                           idx + 1}
                        </div>
                        <span className={`text-[11px] font-semibold truncate ${
                          status === 'completed' ? 'text-emerald-700' :
                          status === 'active' ? 'text-blue-700' :
                          status === 'failed' ? 'text-red-700' :
                          'text-gray-400'
                        }`}>{step.label}</span>
                      </div>
                      <span className={`text-[10px] mt-1 ml-7 truncate px-1.5 py-0.5 rounded-md font-medium ${
                        status === 'completed' ? 'text-emerald-600 bg-emerald-50/50' :
                        status === 'active' ? 'text-blue-600 bg-blue-50/50' :
                        status === 'failed' ? 'text-red-600 bg-red-50/50' :
                        'text-gray-400 bg-gray-50'
                      }`}>{detail || '等待中'}</span>
                      <div className="mt-1.5 ml-7 h-1 rounded-full bg-white/70 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            status === 'completed' ? 'bg-emerald-400' :
                            status === 'active' ? 'bg-blue-400' :
                            status === 'failed' ? 'bg-red-400' :
                            'bg-gray-200'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                          aria-label={`${step.label}进度 ${percent}%`}
                        />
                      </div>
                    </div>
                    {!isLast && (
                      <div className={`w-4 h-0.5 flex-shrink-0 self-center rounded-full ${
                        status === 'completed' ? 'bg-emerald-300' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Product Info Section */}
          {doc && progress && progress.doc >= 100 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Product Document</h2>
              <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-medium border border-emerald-100">Ready</span>
              <span className="text-xs text-gray-400">Images + page content analyzed</span>
            </div>
            <ProductDocSummary doc={doc} />
          </div>
        )}

        {/* Action Buttons */}
        {product && (product.status === 'completed' || product.status === 'failed') && (
          <div className="flex gap-2 mb-6">
            <button onClick={async () => { await rerunProduct(product.id); window.location.reload() }}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-all shadow-sm">
              Re-run Pipeline
            </button>
            {product.status === 'failed' && (
              <button onClick={async () => { await resumeProduct(product.id); window.location.reload() }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all shadow-sm">
                Resume
              </button>
            )}
          </div>
        )}

        {/* Image Analysis & Instruction Board */}
        {doc && doc.images && doc.images.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Image Analysis</h2>
              <span className="rounded-full bg-gray-100 border border-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">{doc.images.length} images</span>
              {product && (
                <button
                  onClick={async () => {
                    try {
                      await reanalyzeProductDoc(product.id)
                      setDoc(null)
                      setProgress({
                        scrape: 100,
                        doc: 10,
                        prompts: 0,
                        error: null,
                        doc_current: 0,
                        doc_total: doc.images.length,
                        doc_stage: '准备识别图片',
                      })
                      if (!pollRef.current) {
                        pollRef.current = setInterval(() => fetchProduct(false), 2000)
                      }
                    } catch (e: any) {
                      alert('重试失败: ' + (e.response?.data?.detail || e.message))
                    }
                  }}
                  className="text-[10px] text-blue-500 hover:text-blue-600 px-2 py-0.5 border rounded-md hover:bg-blue-50 transition-colors"
                >
                  重新识别
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {doc.images.map(img => (
                <ImageAnalysisCard key={img.index} img={img} productId={id!} onPreview={setPreviewImage} />
              ))}
            </div>
          </div>
        )}

        {/* Instruction Board Section */}
        {product && product.status === 'completed' && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Instruction Board</h2>
              {product.instruction_board_status === 'completed' && (
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-medium border border-emerald-100">Ready</span>
              )}
              {product.instruction_board_status === 'generating' && (
                <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 text-[11px] font-medium animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Generating</span>
              )}
              {(product.instruction_board_status === 'none' || product.instruction_board_status === 'failed') && (
                <button
                  onClick={async () => {
                    try {
                      await api.post(`/api/products/${product.id}/generate-instruction-board`)
                    } catch (e: any) {
                      alert('生成失败: ' + (e.response?.data?.detail || e.message))
                    }
                  }}
                  className="px-3 py-1 text-[10px] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
                >
                  生成说明图
                </button>
              )}
              {product.instruction_board_status === 'failed' && (
                <span className="rounded-full bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 text-[11px] font-medium">Failed</span>
              )}
            </div>

            {product.instruction_board_status === 'completed' && (
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-white max-w-3xl">
                <img
                  src={`/api/products/${product.id}/instruction-board`}
                  alt="Product Instruction Board"
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Generate Prompts Section - Show when product is completed */}
        {product && product.status === 'completed' && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">生成视频提示词</h2>
              <p className="text-xs text-gray-600 mb-4">
                {prompts.length > 0
                  ? `已有 ${prompts.length} 个提示词，可继续选择其他风格生成更多`
                  : '选择视频风格模板，每种风格生成 10 个提示词变体'}
              </p>
              <GeneratePromptsForm
                productId={product.id}
                templates={templates}
                progress={progress}
                promptCount={prompts.length}
                manualGenerating={manualPromptGenerating}
                onGenerated={startPromptPolling}
              />
            </div>
          </div>
        )}

        {/* Prompt List Section */}
        {prompts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-800">生成的提示词</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompts.length} 个</span>
            </div>

            {/* Control Panel */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
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
                  templates={templates}
                  hookTemplates={hookTemplates}
                  imageLayoutTemplates={imageLayoutTemplates}
                  onPreviewImage={setPreviewImage}
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
      {id && product && (
        <TaskQueueSidebar
          prompts={prompts}
          productId={id}
          onUpdate={async () => {
            try { setPrompts(await getProductPrompts(id)) } catch { /* ignore */ }
          }}
          open={taskQueueOpen}
          onToggle={() => setTaskQueueOpen(v => !v)}
        />
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </MainLayout>
  )
}

function compactText(value?: string | null, fallback = '待补充'): string {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  return text || fallback
}


function normalizeList(value?: string[] | null): string[] {
  return (value || []).map(item => compactText(item, '')).filter(Boolean)
}

function ProductDocSummary({ doc }: { doc: ProductDoc }) {
  const [showFull, setShowFull] = useState(false)
  const sourceTitle = compactText(doc.source_content?.web_title, compactText(doc.title, '未识别到商品标题'))
  const sourceDescription = compactText(
    doc.source_content?.web_description,
    compactText(doc.description, '页面文案为空，建议重新识别或补充商品链接信息'),
  )
  const keyParts = normalizeList(doc.key_parts)
  const usageSteps = normalizeList(doc.usage_steps)
  const tips = normalizeList(doc.tips)
  const warnings = normalizeList(doc.warnings)
  const evidence = normalizeList(doc.image_evidence)
  const hasContent = (v?: string | null) => v && v.trim().length > 0

  // Selling points as cleaned tags
  const sellingTags = (doc.selling_points || '')
    .split(/[,，;；、]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{compactText(doc.title, sourceTitle)}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{sourceDescription}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">
            {doc.images?.length || 0} images
          </span>
          {doc.category && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 capitalize">
              {doc.category}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4 space-y-4">

        {/* Selling points */}
        {sellingTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sellingTags.map((tag, i) => (
              <span key={i} className="rounded-md bg-gray-50 border border-gray-100 px-2.5 py-1 text-xs text-gray-600 font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Key parts + usage steps — side by side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {keyParts.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Key Components</h4>
              <ul className="space-y-1.5">
                {keyParts.map((part, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700 leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                    <span>{part}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {usageSteps.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">How to Use</h4>
              <ol className="space-y-1.5">
                {usageSteps.map((step, idx) => (
                  <li key={idx} className="flex gap-2 text-xs text-gray-700 leading-relaxed">
                    <span className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Tips + warnings — side by side on desktop */}
        {(tips.length > 0 || warnings.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {tips.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-600/70 mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" />
                  Tips
                </h4>
                <ul className="space-y-1">
                  {tips.map((t, i) => (
                    <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-1.5">
                      <span className="text-amber-400 flex-shrink-0">-</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-red-500/70 mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" />
                  Warnings
                </h4>
                <ul className="space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-1.5">
                      <span className="text-red-300 flex-shrink-0">-</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Expand: full description + evidence */}
        {(hasContent(doc.description) || hasContent(doc.appearance) || evidence.length > 0) && (
          <div>
            <button
              onClick={() => setShowFull(!showFull)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className={`transition-transform duration-200 ${showFull ? 'rotate-180' : ''}`}>
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
              {showFull ? 'Hide details' : 'Full description & evidence'}
            </button>
            {showFull && (
              <div className="mt-3 rounded-xl bg-gray-50/80 px-4 py-3.5 space-y-3">
                {hasContent(doc.description) && (
                  <p className="text-xs leading-relaxed text-gray-700">{doc.description}</p>
                )}
                {hasContent(doc.appearance) && doc.appearance !== doc.description && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Appearance</span>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{doc.appearance}</p>
                  </div>
                )}
                {evidence.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/80">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Image Evidence</span>
                    <ul className="mt-1.5 space-y-1">
                      {evidence.map((e, i) => (
                        <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                          <span className="text-gray-300 flex-shrink-0">-</span>
                          <span>{e}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


function ImageAnalysisCard({ img, productId, onPreview }: { img: any; productId: string; onPreview: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hasFailed = !img.basic_recognition && !img.product_understanding

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.05),0_6px_20px_rgba(0,0,0,0.06)] transition-shadow duration-300">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div
          className="relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all"
          onClick={() => onPreview(getProductImageUrl(productId, img.filename))}
        >
          <img src={getProductImageUrl(productId, img.filename)} alt={`Image ${img.index}`}
            className="w-full h-full object-cover" />
          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center text-[10px] font-bold text-white">
            {img.index}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: label + tags + expand */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-gray-800">Image {img.index}</span>
            {hasFailed && (
              <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[11px] font-medium border border-red-100">Failed</span>
            )}
            {/* Tags — always visible */}
            <div className="flex flex-wrap gap-1">
              {img.focus_subject && (
                <span className="rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{img.focus_subject}</span>
              )}
              {img.relevance && (
                <span className={[
                  "rounded-md px-2 py-0.5 text-[11px] font-medium border",
                  img.relevance === 'primary_product' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                  img.relevance === 'packaging_or_infographic' ? 'bg-violet-50 text-violet-700 border-violet-100' :
                  img.relevance === 'usage_scene' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  img.relevance === 'comparison' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  img.relevance === 'unrelated_or_ambiguous' ? 'bg-red-50 text-red-600 border-red-100' :
                  'bg-gray-50 text-gray-600 border-gray-100'
                ].join(' ')}>
                  {img.relevance.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            {!hasFailed && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
                className="ml-auto flex-shrink-0 text-[11px] font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {expanded ? 'Collapse' : 'Expand'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          {/* Collapsed: one-line recognition preview */}
          {!hasFailed && !expanded && img.basic_recognition && (
            <p className="text-xs leading-relaxed text-gray-500 line-clamp-1">{img.basic_recognition}</p>
          )}

          {hasFailed && !expanded && (
            <p className="text-xs text-gray-500 italic">Recognition failed — re-run analysis</p>
          )}

          {/* Expanded: full content */}
          {expanded && !hasFailed && (
            <div className="space-y-3 mt-2">
              {img.basic_recognition && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Recognition</span>
                  <p className="text-xs leading-relaxed text-gray-600 mt-0.5">{img.basic_recognition}</p>
                </div>
              )}
              {img.product_understanding && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Understanding</span>
                  <p className="text-xs leading-relaxed text-gray-600 mt-0.5">{img.product_understanding}</p>
                </div>
              )}
              {img.creative_usage && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Creative</span>
                  <p className="text-xs leading-relaxed text-gray-600 mt-0.5">{img.creative_usage}</p>
                </div>
              )}
              {img.context_alignment && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Context Alignment</span>
                  <p className="text-xs leading-relaxed text-amber-700 mt-1">{img.context_alignment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


function PromptCard({ prompt, onUpdate, templates, hookTemplates, imageLayoutTemplates, onPreviewImage }: {
  prompt: ProductPrompt
  onUpdate: () => void
  templates: VideoTemplate[]
  hookTemplates: { id: string; key: string; name: string }[]
  imageLayoutTemplates: { id: string; key: string; name: string }[]
  onPreviewImage: (url: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState<'image' | 'video' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(prompt.prompt_text)
  const [saving, setSaving] = useState(false)
  const [showImagePrompt, setShowImagePrompt] = useState(false)

  const [gridLayout, setGridLayout] = useState<string>(prompt.grid_layout || 'single_keyframe')
  const [aspectRatio, setAspectRatio] = useState(prompt.aspect_ratio || '9:16')
  const [videoStyle, setVideoStyle] = useState(prompt.video_style || 'grwm')
  const [hookKey, setHookKey] = useState<string>(prompt.hook_key || 'auto')
  const [videoModel, setVideoModel] = useState(prompt.video_model || 'happyhorse-1.0')
  const [videoDuration, setVideoDuration] = useState(prompt.video_duration || 15)

  const [mediaView, setMediaView] = useState<'image' | 'video'>('image')
  const [regenerating, setRegenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [refineText, setRefineText] = useState('')
  const mediaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopMediaPolling = useCallback(() => {
    if (mediaPollRef.current) { clearInterval(mediaPollRef.current); mediaPollRef.current = null }
  }, [])

  const startMediaPolling = useCallback(() => {
    stopMediaPolling()
    const startedAt = Date.now()
    mediaPollRef.current = setInterval(() => {
      onUpdate()
      if (Date.now() - startedAt > 180000) stopMediaPolling()
    }, 2000)
  }, [onUpdate, stopMediaPolling])

  useEffect(() => {
    setGridLayout(prompt.grid_layout || 'single_keyframe')
    setAspectRatio(prompt.aspect_ratio || '9:16')
    setVideoStyle(prompt.video_style || 'grwm')
    setHookKey(prompt.hook_key || 'auto')
    setVideoModel(prompt.video_model || 'happyhorse-1.0')
    setVideoDuration(prompt.video_duration || 15)
    setEditText(prompt.prompt_text)
    if (prompt.image_status !== 'generating' && prompt.video_status !== 'generating') stopMediaPolling()
  }, [prompt])

  useEffect(() => () => stopMediaPolling(), [stopMediaPolling])

  const VIDEO_DURATION_MAP: Record<string, number[]> = {
    'seedance-2.0': [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'happyhorse-1.0': [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'wan-2.6': [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'veo-3.1': [5, 6, 7, 8],
  }
  const durationOptions = VIDEO_DURATION_MAP[videoModel] || [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

  const handleCopy = () => { navigator.clipboard.writeText(prompt.prompt_text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const handleEdit = () => { setEditText(prompt.prompt_text); setEditing(true); setExpanded(true) }
  const handleSave = async () => {
    setSaving(true)
    try { await updatePrompt(prompt.id, editText); setEditing(false); onUpdate() }
    catch (e: any) { alert('Save failed: ' + (e.response?.data?.detail || e.message)) }
    finally { setSaving(false) }
  }
  const handleCancel = () => { setEditText(prompt.prompt_text); setEditing(false) }

  const handleGenerateImage = async () => {
    if (prompt.image_status === 'completed' && !confirm('Regenerate image?')) return
    setGenerating('image')
    try { await triggerImageGeneration(prompt.id, { grid_layout: gridLayout, aspect_ratio: aspectRatio }); onUpdate(); startMediaPolling() }
    catch (e: any) { alert('Failed: ' + (e.response?.data?.detail || e.message)) }
    finally { setGenerating(null) }
  }

  const handleGenerateVideo = async () => {
    if (prompt.video_status === 'completed' && !confirm('Regenerate video?')) return
    setGenerating('video')
    try { await triggerVideoGeneration(prompt.id); onUpdate(); startMediaPolling() }
    catch (e: any) { alert('Failed: ' + (e.response?.data?.detail || e.message)) }
    finally { setGenerating(null) }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-[11px] font-medium border border-emerald-100">Completed</span>
    if (status === 'generating') return <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-[11px] font-medium border border-blue-100 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Generating</span>
    if (status === 'failed') return <span className="rounded-full bg-red-50 text-red-700 px-2.5 py-0.5 text-[11px] font-medium border border-red-100">Failed</span>
    return null
  }

  const shouldTruncate = prompt.prompt_text.length > 150
  const displayText = expanded || !shouldTruncate ? prompt.prompt_text : prompt.prompt_text.slice(0, 150) + '...'

  const formatPromptText = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const tagMatch = line.match(/^\[([^\]]+)\]\s*(.*)/)
      if (tagMatch) {
        return (
          <div key={i} className="mt-2 first:mt-0">
            <span className="inline-block text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-1.5">{tagMatch[1]}</span>
            <span className="text-sm text-gray-700">{tagMatch[2]}</span>
          </div>
        )
      }
      const cleanLine = line.replace(/^\s*[-–•*]*\s*\**/, '').trim()
      const timeMatch = cleanLine.match(/^(\d+s?\s*[-–]\s*\d+s?(?:\s*(?:seconds?|sec))?)\s*[:||\[]\s*(.*)/) || cleanLine.match(/^\((\d+s?\s*[-–]\s*\d+s?)\)\s*[:||\[]\s*(.*)/) || cleanLine.match(/^(\d+:\d+\s*[-–]\s*\d+:\d+)\s*[:||\[]\s*(.*)/)
      if (timeMatch) {
        return (
          <div key={i} className="mt-1 pl-2">
            <span className="inline-block text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded mr-1.5">{timeMatch[1]}</span>
            <span className="text-sm text-gray-700">{timeMatch[2]}</span>
          </div>
        )
      }
      if (line.trim() === '') return <div key={i} className="h-2" />
      return <div key={i} className="text-sm text-gray-600 leading-relaxed pl-1">{line}</div>
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* ── Card Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-gray-50 text-xs font-bold text-gray-600">
            {prompt.variant_index}
          </span>
          <div>
            <span className="text-sm font-semibold text-gray-800">Variant {prompt.variant_index}</span>
            <span className="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">{prompt.template_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {prompt.image_prompt && (
            <button onClick={() => setShowImagePrompt(v => !v)} className="text-[11px] text-gray-400 hover:text-violet-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-violet-50 transition-colors">
              <ImageIcon className="w-3.5 h-3.5" />Prompt
            </button>
          )}
          <button onClick={handleEdit} disabled={editing} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-30">
            <Edit className="w-3.5 h-3.5" />Edit
          </button>
          <button onClick={handleCopy} className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Card Body ── */}
      <div className="px-5 py-4 space-y-4">
        {/* Image prompt expandable */}
        {showImagePrompt && prompt.image_prompt && (
          <div className="px-3 py-2.5 bg-violet-50/60 border border-violet-100 rounded-xl">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">Image Prompt</span>
            <p className="text-xs text-violet-700 leading-relaxed mt-1">{prompt.image_prompt}</p>
          </div>
        )}

        {/* Prompt text */}
        {editing ? (
          <div>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
              className="w-full text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all" rows={5} />
            <div className="flex gap-2 mt-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-all">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
              </button>
              <button onClick={handleCancel} disabled={saving}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {expanded ? (
              <div className="bg-gray-50/80 rounded-xl p-4 max-h-96 overflow-y-auto">{formatPromptText(prompt.prompt_text)}</div>
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{displayText}</p>
            )}
            {shouldTruncate && (
              <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Collapse</> : <><ChevronDown className="w-3.5 h-3.5" />Expand</>}
              </button>
            )}
          </>
        )}

        {/* Config grid: 2 rows x 3 cols */}
        <div className="grid grid-cols-3 gap-3">
          <SelectField label="Layout" value={gridLayout} onChange={async (v) => { setGridLayout(v); try { await updatePrompt(prompt.id, prompt.prompt_text, { grid_layout: v }); onUpdate() } catch {} }}>
            {[
              { key: "single_keyframe", label: "Single" }, { key: "storyboard_6panel", label: "6-panel (3×2)" },
              { key: "storyboard_9panel", label: "9-panel (3×3)" }, { key: "storyboard_12panel_3x4", label: "12-panel (3×4)" },
              { key: "storyboard_12panel_4x3", label: "12-panel (4×3)" }, { key: "storyboard_16panel", label: "16-panel (4×4)" },
              ...imageLayoutTemplates.filter(t => !["single_keyframe","storyboard_6panel","storyboard_9panel","storyboard_12panel_3x4","storyboard_12panel_4x3","storyboard_16panel"].includes(t.key)).map(t => ({ key: t.key, label: t.name }))
            ].map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </SelectField>
          <SelectField label="Aspect" value={aspectRatio} onChange={async (v) => { setAspectRatio(v); try { await updatePrompt(prompt.id, prompt.prompt_text, { aspect_ratio: v }); onUpdate() } catch {} }}>
            <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
          </SelectField>
          <SelectField label="Style" value={videoStyle} onChange={async (v) => { setVideoStyle(v); await updatePrompt(prompt.id, prompt.prompt_text, { video_style: v }) }} disabled={regenerating}>
            {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
          </SelectField>
          <SelectField label="Hook" value={templates.find(t => t.key === videoStyle)?.has_builtin_hook ? 'none' : hookKey} onChange={(v) => setHookKey(v)} disabled={regenerating || !!templates.find(t => t.key === videoStyle)?.has_builtin_hook}>
            <option value="none">None</option><option value="auto">Smart Select</option>
            {hookTemplates.map(h => <option key={h.key} value={h.key}>{h.name}</option>)}
          </SelectField>
          <SelectField label="Model" value={videoModel} onChange={async (v) => { setVideoModel(v); const dOpts = VIDEO_DURATION_MAP[v] || [5,6,7,8,9,10,11,12,13,14,15]; let d = videoDuration; if (!dOpts.includes(d)) { d = dOpts[dOpts.length - 1]; setVideoDuration(d) }; try { await updatePrompt(prompt.id, prompt.prompt_text, { video_model: v, video_duration: d }); onUpdate() } catch {} }}>
            <option value="seedance-2.0">Seedance 2.0</option><option value="happyhorse-1.0">HappyHorse 1.0</option>
            <option value="wan-2.6">Wan 2.6</option><option value="veo-3.1">Veo 3.1</option>
          </SelectField>
          <SelectField label="Duration" value={videoDuration} onChange={async (v) => { const n = Number(v); setVideoDuration(n); try { await updatePrompt(prompt.id, prompt.prompt_text, { video_duration: n }); onUpdate() } catch {} }}>
            {durationOptions.map(d => <option key={d} value={d}>{d}s</option>)}
          </SelectField>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={async () => {
            setRegenerating(true)
            try { const u = await regeneratePrompt(prompt.id, videoStyle, hookKey === 'none' ? undefined : hookKey); setHookKey(u.hook_key || 'auto'); setVideoStyle(u.video_style || videoStyle); onUpdate() }
            catch (e: any) { alert('Failed: ' + (e.response?.data?.detail || e.message)) }
            finally { setRegenerating(false) }
          }} disabled={regenerating || refining}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 disabled:opacity-40 border border-amber-100 transition-all">
            {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit className="w-3.5 h-3.5" />}Regenerate
          </button>
          <button onClick={() => setShowRefine(v => !v)} disabled={regenerating || refining}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-violet-50 text-violet-700 rounded-xl hover:bg-violet-100 disabled:opacity-40 border border-violet-100 transition-all">
            Refine
          </button>
        </div>

        {showRefine && (
          <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3">
            <textarea value={refineText} onChange={e => setRefineText(e.target.value)}
              placeholder="Describe your refinements…"
              rows={2} className="w-full text-sm border border-violet-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-violet-300 resize-none" />
            <div className="flex gap-2 mt-2">
              <button onClick={async () => {
                if (!refineText.trim()) return; setRefining(true)
                try { await refinePrompt(prompt.id, refineText.trim()); onUpdate(); setRefineText(''); setShowRefine(false) }
                catch (e: any) { alert('Failed: ' + (e.response?.data?.detail || e.message)) }
                finally { setRefining(false) }
              }} disabled={refining || !refineText.trim()}
                className="px-4 py-2 text-xs font-medium bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1.5 transition-all">
                {refining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{refining ? 'Refining…' : 'Apply'}
              </button>
              <button onClick={() => { setShowRefine(false); setRefineText('') }} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleGenerateImage} disabled={generating === 'image' || prompt.image_status === 'generating'}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-30 transition-all">
            {generating === 'image' || prompt.image_status === 'generating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
            Generate Image
          </button>
          <button onClick={handleGenerateVideo} disabled={generating === 'video' || prompt.video_status === 'generating'}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-30 transition-all">
            {generating === 'video' || prompt.video_status === 'generating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
            Generate Video
          </button>
        </div>

        {/* Status badges */}
        <div className="flex gap-2">
          {getStatusBadge(prompt.image_status)}
          {getStatusBadge(prompt.video_status)}
        </div>

        {/* Progress / error messages */}
        {prompt.image_status === 'generating' && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50/60 border border-blue-100 rounded-xl">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
            <span className="text-xs text-blue-700 font-medium">Generating image (30–60s)...</span>
          </div>
        )}
        {prompt.image_status === 'failed' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50/60 border border-red-100 rounded-xl">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <span className="text-xs text-red-700 leading-relaxed">Image generation failed{prompt.error_message ? ': ' + prompt.error_message : '. Retry?'}</span>
          </div>
        )}
        {prompt.video_status === 'generating' && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50/60 border border-violet-100 rounded-xl">
            <Loader2 className="w-4 h-4 text-violet-500 animate-spin flex-shrink-0" />
            <span className="text-xs text-violet-700 font-medium">Generating video (2–5 min)...</span>
          </div>
        )}
        {prompt.video_status === 'failed' && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50/60 border border-red-100 rounded-xl">
            <span className="text-xs text-red-700">Video generation failed. Retry?</span>
          </div>
        )}

        {/* Media toggle */}
        {(prompt.image_status === 'completed' || prompt.video_status === 'completed') && (
          <div className="flex rounded-xl bg-gray-50 p-1">
            <button onClick={() => setMediaView('image')} disabled={prompt.image_status !== 'completed'}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mediaView === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'} disabled:opacity-30`}>
              Image {prompt.image_status === 'completed' && ' ✓'}
            </button>
            <button onClick={() => setMediaView('video')} disabled={prompt.video_status !== 'completed'}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mediaView === 'video' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'} disabled:opacity-30`}>
              Video {prompt.video_status === 'completed' && ' ✓'}
            </button>
          </div>
        )}

        {/* Media display */}
        {mediaView === 'image' && prompt.image_status === 'completed' && (
          <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
            <img src={`${getGeneratedImageUrl(prompt.id)}?t=${Date.now()}`} alt="Generated"
              className="w-full cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => onPreviewImage(`${getGeneratedImageUrl(prompt.id)}?t=${Date.now()}`)} />
          </div>
        )}
        {mediaView === 'video' && prompt.video_status === 'completed' && (
          <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
            <video src={`/api/products/prompts/${prompt.id}/video`} controls className="w-full" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── SelectField helper ──
function SelectField({ label, value, onChange, disabled, children }: {
  label: string; value: string | number; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 block">{label}</label>
      <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} disabled={disabled}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-700 bg-gray-50/50 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100 focus:border-gray-300 disabled:opacity-40 transition-all">
        {children}
      </select>
    </div>
  )
}


function GeneratePromptsForm({
  productId,
  templates,
  progress,
  promptCount,
  manualGenerating,
  onGenerated,
}: {
  productId: string
  templates: VideoTemplate[]
  progress: ProductProgress | null
  promptCount: number
  manualGenerating: boolean
  onGenerated: () => void
}) {
  const [starting, setStarting] = useState(false)
  const rawProgress = progress?.prompts ?? 0
  const isBackendGenerating = rawProgress > 0 && rawProgress < 100
  const isGenerating = starting || manualGenerating || isBackendGenerating
  const progressValue = isGenerating
    ? rawProgress > 0 && rawProgress < 100 ? rawProgress : 5
    : promptCount > 0
      ? 100
      : 0
  const statusText = isGenerating
    ? `正在生成提示词 · ${Math.round(progressValue)}%`
    : promptCount > 0
      ? `已生成 ${promptCount} 个提示词`
      : '等待生成'

  const handleGenerate = async () => {
    setStarting(true)
    try {
      // No template_key = round-robin across all active templates
      await generatePrompts(productId, '')
      onGenerated()
    } catch (e: any) {
      alert('生成失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        将自动使用 {templates.length} 种视频风格轮流生成 10 个提示词变体，生成后可在每个卡片上单独切换风格并重新生成
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="min-h-10 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-lg hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            '生成提示词'
          )}
        </button>

        <div className="flex-1 min-w-[220px] rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-gray-700">{statusText}</span>
            <span className="text-[10px] text-gray-500">{Math.min(promptCount, 10)} / 10</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, progressValue))}%` }}
            />
          </div>
        </div>
      </div>
      {progress?.error && isGenerating && (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {progress.error}
        </div>
      )}
    </div>
  )
}
