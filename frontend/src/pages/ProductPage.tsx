import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MainLayout } from '../components/layout/MainLayout'
import { Loader2, Check, Copy, Image as ImageIcon, Video, AlertCircle } from 'lucide-react'
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

  const fetchProduct = useCallback(async () => {
    if (!id) return
    try {
      const p = await getProduct(id)
      setProduct(p)
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
    } catch {
      // ignore fetch errors during polling
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    fetchProduct()
    pollRef.current = setInterval(fetchProduct, 2000)
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
      navigate(`/product/${p.id}`)
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
        {/* URL Input */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">产品视频生成</h1>
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

        {/* PLACEHOLDER_KANBAN */}

        {/* Kanban Pipeline */}
        {id && product && (
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
        )}

        {/* PLACEHOLDER_PRODUCT_INFO */}

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

        {/* PLACEHOLDER_PROMPTS */}

        {/* Prompt List Section */}
        {prompts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-800">生成的提示词</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompts.length} 个</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prompts.map(prompt => (
                <PromptCard key={prompt.id} prompt={prompt} />
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

function PromptCard({ prompt }: { prompt: ProductPrompt }) {
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState<'image' | 'video' | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.prompt_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-800">变体 {prompt.variant_index}</span>
          <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{prompt.template_name}</span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      <p className="text-xs text-gray-700 leading-relaxed mb-3 line-clamp-3">
        {prompt.prompt_text.slice(0, 100)}...
      </p>

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

