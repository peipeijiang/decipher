import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/layout/MainLayout'
import { TaskQueueSidebar } from '../components/TaskQueueSidebar'
import { Loader2, Check, Copy, Image as ImageIcon, Video, AlertCircle, ChevronDown, ChevronUp, Edit, Save, X, FileText, Layers, Lightbulb, Zap, ListChecks, Wrench, ShieldAlert, Info } from 'lucide-react'
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
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight mb-1">{product.title || '产品详情'}</h1>
                  <p className="text-xs text-gray-400 truncate">{product.url}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setTaskQueueOpen(v => !v)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    任务队列
                  </button>
                  <button
                    onClick={async () => {
                      await archiveProduct(product.id)
                      navigate('/product/history')
                    }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    归档
                  </button>
                </div>
              </div>
            </div>

            {/* Pipeline Progress */}
            <div className="mb-6">
            {product.status === 'failed' && progress?.error && (
              <div className="mb-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
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
                    <div className={`flex flex-col justify-center px-3 py-2 rounded-lg flex-1 min-w-0 transition-all ${
                      status === 'completed' ? 'bg-green-100' :
                      status === 'active' ? 'bg-blue-100' :
                      status === 'failed' ? 'bg-red-100' :
                      'bg-transparent'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          status === 'completed' ? 'bg-green-500 text-white' :
                          status === 'active' ? 'bg-blue-500 text-white animate-pulse' :
                          status === 'failed' ? 'bg-red-500 text-white' :
                          'bg-gray-300 text-white'
                        }`}>
                          {status === 'completed' ? <Check className="w-3 h-3" /> :
                           status === 'active' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                           status === 'failed' ? <X className="w-3 h-3" /> :
                           idx + 1}
                        </div>
                        <span className={`text-xs font-semibold truncate ${
                          status === 'completed' ? 'text-green-700' :
                          status === 'active' ? 'text-blue-700' :
                          status === 'failed' ? 'text-red-700' :
                          'text-gray-400'
                        }`}>{step.label}</span>
                      </div>
                      <span className={`text-[10px] mt-1 ml-7 truncate px-1.5 py-0.5 rounded-md font-medium ${
                        status === 'completed' ? 'text-green-600 bg-green-50' :
                        status === 'active' ? 'text-blue-600 bg-blue-50' :
                        status === 'failed' ? 'text-red-600 bg-red-50' :
                        'text-gray-400 bg-gray-50'
                      }`}>{detail || '等待中'}</span>
                      <div className="mt-1.5 ml-7 h-1 rounded-full bg-white/70 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            status === 'completed' ? 'bg-green-500' :
                            status === 'active' ? 'bg-blue-500' :
                            status === 'failed' ? 'bg-red-500' :
                            'bg-gray-300'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                          aria-label={`${step.label}进度 ${percent}%`}
                        />
                      </div>
                    </div>
                    {!isLast && (
                      <div className={`w-4 h-0.5 flex-shrink-0 self-center ${
                        status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
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
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-800">产品文档</h2>
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">识别完成</span>
              <span className="text-xs text-gray-500">已汇总图片与页面文字</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Product Images */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-800">商品图片</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">共 {doc.images.length} 张</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {doc.images.map(img => (
                  <div
                    key={img.index}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                    onClick={() => setPreviewImage(getProductImageUrl(id!, img.filename))}
                  >
                    <img
                      src={getProductImageUrl(id!, img.filename)}
                      alt={`商品图 ${img.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            <ProductDocSummary doc={doc} />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {product && (product.status === 'completed' || product.status === 'failed') && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={async () => {
                await rerunProduct(product.id)
                window.location.reload()
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              重新运行
            </button>
            {product.status === 'failed' && (
              <button
                onClick={async () => {
                  await resumeProduct(product.id)
                  window.location.reload()
                }}
                className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
              >
                继续运行
              </button>
            )}
          </div>
        )}

        {/* Image Analysis & Instruction Board */}
        {doc && doc.images && doc.images.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-800">图片识别结果</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{doc.images.length} 张</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {doc.images.map(img => (
                <ImageAnalysisCard key={img.index} img={img} productId={id!} onPreview={setPreviewImage} />
              ))}
            </div>
          </div>
        )}

        {/* Instruction Board Section */}
        {product && product.status === 'completed' && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-800">产品使用说明</h2>
              {product.instruction_board_status === 'completed' && (
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已生成</span>
              )}
              {product.instruction_board_status === 'generating' && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full animate-pulse">生成中...</span>
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
                <span className="text-[10px] text-red-500">生成失败，可重试</span>
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900">产品文档</h3>
          </div>
          <p className="text-sm font-semibold leading-snug text-gray-800">{compactText(doc.title, sourceTitle)}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {doc.images?.length || 0} 张图
          </span>
          {doc.category && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
              {doc.category}
            </span>
          )}
        </div>
      </div>

      {/* Source */}
      <SectionBlock icon={Info} label="网页来源" className="mb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-800">{sourceTitle}</p>
          <p className="text-xs leading-relaxed text-gray-600">{sourceDescription}</p>
        </div>
      </SectionBlock>

      {/* Description + Appearance */}
      {(hasContent(doc.description) || hasContent(doc.appearance)) && (
        <SectionBlock icon={FileText} label="产品描述" className="mb-4">
          <p className="text-xs leading-relaxed text-gray-700">
            {hasContent(doc.description) ? doc.description : doc.appearance}
          </p>
          {hasContent(doc.description) && hasContent(doc.appearance) && (
            <p className="mt-2 text-xs leading-relaxed text-gray-600">{doc.appearance}</p>
          )}
        </SectionBlock>
      )}

      {/* Key Parts */}
      {keyParts.length > 0 && (
        <SectionBlock icon={Wrench} label="关键部件" className="mb-4">
          <MiniList items={keyParts} max={8} />
        </SectionBlock>
      )}

      {/* Usage Steps */}
      {usageSteps.length > 0 && (
        <SectionBlock icon={ListChecks} label="使用步骤" className="mb-4">
          <ol className="space-y-1">
            {usageSteps.slice(0, 8).map((step, idx) => (
              <li key={idx} className="flex gap-2 text-[11px] leading-relaxed text-gray-700">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-semibold text-blue-600">{idx + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </SectionBlock>
      )}

      {/* Selling Points */}
      {hasContent(doc.selling_points) && (
        <SectionBlock icon={Zap} label="核心卖点" className="mb-4">
          <p className="text-xs leading-relaxed text-gray-700">{doc.selling_points}</p>
        </SectionBlock>
      )}

      {/* Tips */}
      {tips.length > 0 && (
        <SectionBlock icon={Lightbulb} label="使用技巧" className="mb-4">
          <MiniList items={tips} max={6} />
        </SectionBlock>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <SectionBlock icon={ShieldAlert} label="注意事项" className="mb-4">
          <MiniList items={warnings} max={6} />
        </SectionBlock>
      )}

      {/* Image Evidence */}
      {evidence.length > 0 && (
        <SectionBlock icon={Layers} label="图片证据">
          <MiniList items={evidence} max={6} />
        </SectionBlock>
      )}
    </div>
  )
}

function SectionBlock({ icon: Icon, label, children, className = '' }: {
  icon: any
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      </div>
      <div className="rounded-lg bg-gray-50 px-3 py-2.5">{children}</div>
    </div>
  )
}

function MiniList({ items, max }: { items: string[]; max: number }) {
  return (
    <div className="space-y-1">
      {items.slice(0, max).map((item, idx) => (
        <div key={idx} className="flex gap-1.5 text-[11px] leading-relaxed text-gray-600">
          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-300" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}


function ImageAnalysisCard({ img, productId, onPreview }: { img: any; productId: string; onPreview: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hasFailed = !img.basic_recognition && !img.product_understanding
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3 p-3">
        <div
          className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
          onClick={() => onPreview(getProductImageUrl(productId, img.filename))}
        >
          <img
            src={getProductImageUrl(productId, img.filename)}
            alt={`图片 ${img.index}`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-800">图片 {img.index}</span>
            {hasFailed && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">识别失败</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
              className="text-[10px] text-blue-500 hover:text-blue-600"
            >
              {expanded ? '收起' : '展开'}
            </button>
          </div>
          {hasFailed ? (
            <div className="text-[11px] text-gray-500">
              图片识别失败，请重新运行分析
            </div>
          ) : (
            <>
              {(img.focus_subject || img.relevance) && (
                <div className="flex flex-wrap gap-1">
                  {img.focus_subject && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      焦点：{img.focus_subject}
                    </span>
                  )}
                  {img.relevance && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                      {img.relevance}
                    </span>
                  )}
                </div>
              )}
              <div className={`text-[11px] leading-relaxed text-gray-700 ${expanded ? '' : 'line-clamp-2'}`}>
                <span className="text-blue-600 font-medium">识别：</span>{img.basic_recognition}
              </div>
              {expanded && (
                <>
                  <div className="text-[11px] leading-relaxed text-gray-700">
                    <span className="text-green-600 font-medium">产品理解：</span>{img.product_understanding}
                  </div>
                  <div className="text-[11px] leading-relaxed text-gray-700">
                    <span className="text-purple-600 font-medium">创意建议：</span>{img.creative_usage}
                  </div>
                  {img.context_alignment && (
                    <div className="text-[11px] leading-relaxed text-gray-700">
                      <span className="text-amber-600 font-medium">上下文校准：</span>{img.context_alignment}
                    </div>
                  )}
                </>
              )}
            </>
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

  // Local state for grid layout, aspect ratio, video style, video model, and video duration
  const [gridLayout, setGridLayout] = useState<string>(prompt.grid_layout || 'single_keyframe')
  const [aspectRatio, setAspectRatio] = useState(prompt.aspect_ratio || '9:16')
  const [videoStyle, setVideoStyle] = useState(prompt.video_style || 'grwm')
  const [hookKey, setHookKey] = useState<string>(prompt.hook_key || 'auto')
  const [videoModel, setVideoModel] = useState(prompt.video_model || 'happyhorse-1.0')
  const [videoDuration, setVideoDuration] = useState(prompt.video_duration || 15)

  // Media display toggle: 'image' or 'video'
  const [mediaView, setMediaView] = useState<'image' | 'video'>('image')
  const [regenerating, setRegenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [showRefine, setShowRefine] = useState(false)
  const [refineText, setRefineText] = useState('')
  const mediaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopMediaPolling = useCallback(() => {
    if (mediaPollRef.current) {
      clearInterval(mediaPollRef.current)
      mediaPollRef.current = null
    }
  }, [])

  const startMediaPolling = useCallback(() => {
    stopMediaPolling()
    const startedAt = Date.now()
    mediaPollRef.current = setInterval(() => {
      onUpdate()
      if (Date.now() - startedAt > 180000) {
        stopMediaPolling()
      }
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
    if (prompt.image_status !== 'generating' && prompt.video_status !== 'generating') {
      stopMediaPolling()
    }
  }, [prompt])

  useEffect(() => () => stopMediaPolling(), [stopMediaPolling])

  // Dynamic duration options based on video model
  const VIDEO_DURATION_MAP: Record<string, number[]> = {
    'seedance-2.0': [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'happyhorse-1.0': [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'wan-2.6': [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'veo-3.1': [5, 6, 7, 8],
  }
  const durationOptions = VIDEO_DURATION_MAP[videoModel] || [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

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
    if (prompt.image_status === 'completed') {
      if (!confirm('图片已生成，确定要重新生成吗？')) return
    }
    setGenerating('image')
    try {
      await triggerImageGeneration(prompt.id, {
        grid_layout: gridLayout,
        aspect_ratio: aspectRatio,
      })
      onUpdate()
      startMediaPolling()
    } catch (e: any) {
      alert('启动失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setGenerating(null)
    }
  }

  const handleGenerateVideo = async () => {
    if (prompt.video_status === 'completed') {
      if (!confirm('视频已生成，确定要重新生成吗？')) return
    }
    setGenerating('video')
    try {
      await triggerVideoGeneration(prompt.id)
      onUpdate()
      startMediaPolling()
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

  const shouldTruncate = prompt.prompt_text.length > 150
  const displayText = expanded || !shouldTruncate ? prompt.prompt_text : prompt.prompt_text.slice(0, 150) + '...'

  // Format prompt text with highlighted section tags
  const formatPromptText = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      const tagMatch = line.match(/^\[([^\]]+)\]\s*(.*)/)
      if (tagMatch) {
        return (
          <div key={i} className="mt-2 first:mt-0">
            <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mr-1">{tagMatch[1]}</span>
            <span className="text-xs text-gray-700">{tagMatch[2]}</span>
          </div>
        )
      }
      // Match timestamp patterns: "0-2s:", "- 0-2s:", "0:00-0:03 |", "- 0:00-0:02 [..."
      // Also: "0s-2s:", "(0-2s)", "  0-2s:", "0-2 seconds:", "**0-2s:**"
      const cleanLine = line.replace(/^\s*[-–•*]*\s*\**/, '').trim()
      const timeMatch = cleanLine.match(/^(\d+s?\s*[-–]\s*\d+s?(?:\s*(?:seconds?|sec))?)\s*[:||\[]\s*(.*)/) ||
                         cleanLine.match(/^\((\d+s?\s*[-–]\s*\d+s?)\)\s*[:||\[]\s*(.*)/) ||
                         cleanLine.match(/^(\d+:\d+\s*[-–]\s*\d+:\d+)\s*[:||\[]\s*(.*)/)
      if (timeMatch) {
        return (
          <div key={i} className="mt-1 pl-2">
            <span className="inline-block text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mr-1">{timeMatch[1]}</span>
            <span className="text-xs text-gray-700">{timeMatch[2]}</span>
          </div>
        )
      }
      if (line.trim() === '') return <div key={i} className="h-1" />
      return <div key={i} className="text-xs text-gray-600 leading-relaxed pl-1">{line}</div>
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800">变体 {prompt.variant_index}</span>
          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompt.template_name}</span>
        </div>
        <div className="flex items-center gap-2">
          {prompt.image_prompt && (
            <button
              onClick={() => setShowImagePrompt(v => !v)}
              className="text-[10px] text-gray-400 hover:text-purple-500 flex items-center gap-0.5 transition-colors"
            >
              <ImageIcon className="w-3 h-3" />
              图片提示词
            </button>
          )}
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

      {/* Image prompt expandable */}
      {showImagePrompt && prompt.image_prompt && (
        <div className="mb-2 px-2 py-1.5 bg-purple-50 border border-purple-100 rounded-lg">
          <p className="text-[10px] text-purple-600 leading-relaxed">{prompt.image_prompt}</p>
        </div>
      )}

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
          {expanded ? (
            <div className="mb-2 bg-gray-50 rounded-lg p-3 max-h-96 overflow-y-auto">
              {formatPromptText(prompt.prompt_text)}
            </div>
          ) : (
            <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-3">{displayText}</p>
          )}
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

      {/* Selectors: 2 rows */}
      <div className="space-y-2 mb-3">
        {/* Row 1: Image settings */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">图片布局</label>
            <select
              value={gridLayout}
              onChange={async (e) => {
                const newLayout = e.target.value
                setGridLayout(newLayout)
                try {
                  await updatePrompt(prompt.id, prompt.prompt_text, { grid_layout: newLayout })
                  onUpdate()
                } catch (e: any) {
                  alert('更新失败：' + (e.response?.data?.detail || e.message))
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
            >
              {[
                { key: "single_keyframe", label: "单图" },
                { key: "storyboard_6panel", label: "6宫格 (3×2)" },
                { key: "storyboard_9panel", label: "9宫格 (3×3)" },
                { key: "storyboard_12panel_3x4", label: "12宫格 (3×4)" },
                { key: "storyboard_12panel_4x3", label: "12宫格 (4×3)" },
                { key: "storyboard_16panel", label: "16宫格 (4×4)" },
              ].map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
              {imageLayoutTemplates.filter(t => !["single_keyframe","storyboard_6panel","storyboard_9panel","storyboard_12panel_3x4","storyboard_12panel_4x3","storyboard_16panel"].includes(t.key)).map(t => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">画面比例</label>
            <select
              value={aspectRatio}
              onChange={async (e) => {
                const newRatio = e.target.value
                setAspectRatio(newRatio)
                try {
                  await updatePrompt(prompt.id, prompt.prompt_text, { aspect_ratio: newRatio })
                  onUpdate()
                } catch (e: any) {
                  alert('更新失败：' + (e.response?.data?.detail || e.message))
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">视频风格</label>
            <select
              value={videoStyle}
              onChange={async (e) => {
                const newStyle = e.target.value
                setVideoStyle(newStyle)
                await updatePrompt(prompt.id, prompt.prompt_text, { video_style: newStyle })
              }}
              disabled={regenerating}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {templates.map(t => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Row 2: Video settings */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">开场白</label>
            <select
              value={templates.find(t => t.key === videoStyle)?.has_builtin_hook ? 'none' : hookKey}
              onChange={(e) => setHookKey(e.target.value)}
              disabled={regenerating || !!templates.find(t => t.key === videoStyle)?.has_builtin_hook}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:opacity-50"
            >
              <option value="none">不使用</option>
              <option value="auto">智能选择</option>
              {hookTemplates.map(h => (
                <option key={h.key} value={h.key}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">视频模型</label>
            <select
              value={videoModel}
              onChange={async (e) => {
                const newModel = e.target.value
                setVideoModel(newModel)
                const newDurationOptions = VIDEO_DURATION_MAP[newModel] || [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
                let adjustedDuration = videoDuration
                if (!newDurationOptions.includes(videoDuration)) {
                  adjustedDuration = newDurationOptions[newDurationOptions.length - 1]
                  setVideoDuration(adjustedDuration)
                }
                try {
                  await updatePrompt(prompt.id, prompt.prompt_text, { video_model: newModel, video_duration: adjustedDuration })
                  onUpdate()
                } catch (e: any) {
                  alert('更新失败：' + (e.response?.data?.detail || e.message))
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="seedance-2.0">Seedance 2.0</option>
              <option value="happyhorse-1.0">HappyHorse 1.0</option>
              <option value="wan-2.6">Wan 2.6</option>
              <option value="veo-3.1">Veo 3.1</option>
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400 mb-0.5 block">时长</label>
            <select
              value={videoDuration}
              onChange={async (e) => {
                const newDuration = Number(e.target.value)
                setVideoDuration(newDuration)
                try {
                  await updatePrompt(prompt.id, prompt.prompt_text, { video_duration: newDuration })
                  onUpdate()
                } catch (e: any) {
                  alert('更新失败：' + (e.response?.data?.detail || e.message))
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
            >
              {durationOptions.map(d => (
                <option key={d} value={d}>{d}秒</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <button
          onClick={async () => {
            setRegenerating(true)
            try {
              const updated = await regeneratePrompt(prompt.id, videoStyle, hookKey === 'none' ? undefined : hookKey)
              setHookKey(updated.hook_key || 'auto')
              setVideoStyle(updated.video_style || videoStyle)
              onUpdate()
            } catch (e: any) {
              alert('重新生成失败：' + (e.response?.data?.detail || e.message))
            } finally {
              setRegenerating(false)
            }
          }}
          disabled={regenerating || refining}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {regenerating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Edit className="w-3.5 h-3.5" />
          )}
          重新生成提示词
        </button>
        <button
          onClick={() => setShowRefine(v => !v)}
          disabled={regenerating || refining}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          微调
        </button>
      </div>

      {showRefine && (
        <div className="mb-2 bg-violet-50 border border-violet-200 rounded-lg p-3">
          <textarea
            value={refineText}
            onChange={e => setRefineText(e.target.value)}
            placeholder="输入微调指令，如：所有镜头都要有宠物出镜、加入产品特写、语气更活泼..."
            rows={2}
            className="w-full text-xs border border-violet-200 rounded-lg p-2 mb-2 focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!refineText.trim()) return
                setRefining(true)
                try {
                  await refinePrompt(prompt.id, refineText.trim())
                  onUpdate()
                  setRefineText('')
                  setShowRefine(false)
                } catch (e: any) {
                  alert('微调失败：' + (e.response?.data?.detail || e.message))
                } finally {
                  setRefining(false)
                }
              }}
              disabled={refining || !refineText.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {refining ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {refining ? '微调中...' : '确认微调'}
            </button>
            <button
              onClick={() => { setShowRefine(false); setRefineText('') }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
          </div>
        </div>
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

      {/* Image generating progress */}
      {prompt.image_status === 'generating' && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
          <span className="text-xs text-blue-600 font-medium">图片生成中，预计需要 30-60 秒...</span>
        </div>
      )}

      {/* Image failed */}
      {prompt.image_status === 'failed' && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
          <span className="text-xs leading-relaxed text-red-600">
            图片生成失败{prompt.error_message ? `：${prompt.error_message}` : '，请重试'}
          </span>
        </div>
      )}

      {/* Media toggle buttons - show when both image and video are available */}
      {(prompt.image_status === 'completed' || prompt.video_status === 'completed') && (
        <div className="mt-3 flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setMediaView('image')}
            disabled={prompt.image_status !== 'completed'}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mediaView === 'image'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            图片 {prompt.image_status === 'completed' && '✓'}
          </button>
          <button
            onClick={() => setMediaView('video')}
            disabled={prompt.video_status !== 'completed'}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mediaView === 'video'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            视频 {prompt.video_status === 'completed' && '✓'}
          </button>
        </div>
      )}

      {/* Image display */}
      {mediaView === 'image' && prompt.image_status === 'completed' && (
        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
          <img
            src={`${getGeneratedImageUrl(prompt.id)}?t=${Date.now()}`}
            alt="生成的图片"
            className="w-full cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onPreviewImage(`${getGeneratedImageUrl(prompt.id)}?t=${Date.now()}`)}
          />
        </div>
      )}

      {/* Video generating progress */}
      {prompt.video_status === 'generating' && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-purple-50 border border-purple-100 rounded-lg">
          <Loader2 className="w-4 h-4 text-purple-500 animate-spin flex-shrink-0" />
          <span className="text-xs text-purple-600 font-medium">视频生成中，预计需要 2-5 分钟...</span>
        </div>
      )}

      {/* Video failed */}
      {prompt.video_status === 'failed' && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
          <span className="text-xs text-red-600">视频生成失败，请重试</span>
        </div>
      )}

      {/* Video display */}
      {mediaView === 'video' && prompt.video_status === 'completed' && (
        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
          <video src={`/api/products/prompts/${prompt.id}/video`} controls className="w-full" />
        </div>
      )}
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
