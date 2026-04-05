import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Sparkles, Copy, Check, ChevronDown, ChevronUp, Loader2, ImageIcon } from 'lucide-react'
import api from '../api/client'
import { MainLayout } from '../components/layout/MainLayout'

interface Angle {
  index: number
  title: string
  hook_visual: string
  hook_copy: string
  concept: string
  why: string
}

interface CreativeResult {
  angle: Angle
  prompt: string
}

type CreativeStyle = 'general' | 'ugc' | 'professional' | 'lifestyle'

const STYLE_OPTIONS: { value: CreativeStyle; label: string; desc: string }[] = [
  { value: 'general', label: '通用', desc: '多样化风格' },
  { value: 'ugc', label: 'UGC自拍', desc: '素人真实感' },
  { value: 'professional', label: '专业广告', desc: '高质感品牌' },
  { value: 'lifestyle', label: '生活方式', desc: '情感故事' },
]


const CARD_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', badge: 'bg-blue-500', tag: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', badge: 'bg-purple-500', tag: 'bg-purple-100 text-purple-700' },
  { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', badge: 'bg-green-500', tag: 'bg-green-100 text-green-700' },
  { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-700', badge: 'bg-orange-500', tag: 'bg-orange-100 text-orange-700' },
  { bg: 'bg-pink-50', border: 'border-pink-200', title: 'text-pink-700', badge: 'bg-pink-500', tag: 'bg-pink-100 text-pink-700' },
]

function PromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)
  const sections = parsePromptSections(prompt)

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 bg-gray-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-300">Video Prompt</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="p-3 space-y-2">
        {sections.length > 0 ? sections.map(([tag, content], i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="text-yellow-400 font-mono font-semibold whitespace-nowrap flex-shrink-0">[{tag}]</span>
            <span className="text-gray-300 leading-relaxed">{content}</span>
          </div>
        )) : (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{prompt}</pre>
        )}
      </div>
    </div>
  )
}

function parsePromptSections(text: string): [string, string][] {
  const sections: [string, string][] = []
  const regex = /\[(\w+)\]\s*/g
  let match
  const matches: { tag: string; index: number }[] = []
  while ((match = regex.exec(text)) !== null) {
    matches.push({ tag: match[1], index: match.index + match[0].length })
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].tag.length - 3 : text.length
    sections.push([matches[i].tag, text.slice(start, end).trim()])
  }
  return sections
}

function AngleCard({ result, idx }: { result: CreativeResult; idx: number }) {
  const [expanded, setExpanded] = useState(false)
  const color = CARD_COLORS[idx % CARD_COLORS.length]
  const { angle, prompt } = result

  return (
    <div className={`${color.bg} ${color.border} border rounded-2xl overflow-hidden`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5 ${color.badge}`}>
            {idx + 1}
          </span>
          <h3 className={`text-sm font-bold ${color.title} leading-snug`}>{angle.title}</h3>
        </div>

        {/* Hook */}
        <div className="mb-3 space-y-1.5">
          <div className="flex gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${color.tag}`}>视觉</span>
            <p className="text-xs text-gray-700 leading-relaxed">{angle.hook_visual}</p>
          </div>
          <div className="flex gap-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${color.tag}`}>文案</span>
            <p className="text-xs text-gray-800 font-medium leading-relaxed">"{angle.hook_copy}"</p>
          </div>
        </div>

        {/* Concept */}
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Concept</div>
          <p className="text-xs text-gray-700 leading-relaxed">{angle.concept}</p>
        </div>

        {/* Why */}
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why it fits</div>
          <p className="text-xs text-gray-600 leading-relaxed italic">{angle.why}</p>
        </div>
      </div>

      {/* Prompt toggle */}
      <div className="border-t border-black/5">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-black/5 transition-colors"
        >
          <span>查看 Video Prompt</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <div className="px-4 pb-4">
            {prompt ? (
              <PromptBlock prompt={prompt} />
            ) : (
              <div className="mt-3 bg-gray-100 rounded-xl p-3 text-xs text-gray-500 text-center">
                Prompt 生成失败
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CreativePage() {
  const location = useLocation()
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [count, setCount] = useState(5)
  const [style, setStyle] = useState<CreativeStyle>('general')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CreativeResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Restore from history sidebar
  useEffect(() => {
    const state = location.state as { restore?: { description: string; results: CreativeResult[] } } | null
    if (state?.restore) {
      setDescription(state.restore.description)
      setResults(state.restore.results)
    }
  }, [location.state])

  const handleImage = (file: File) => {
    setImage(file)
    const reader = new FileReader()
    reader.onload = e => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleGenerate = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const form = new FormData()
      form.append('description', description)
      form.append('count', String(count))
      form.append('style', style)
      if (image) form.append('image', image)
      const res = await api.post('/api/creative/generate', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResults(res.data.results || [])
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-text-primary">创意Prompt</h1>
          <p className="text-xs text-text-secondary">输入产品描述，AI 生成多角度创意方案 + 视频提示词</p>
        </div>

        {/* Input area */}
        <div className="glass rounded-2xl p-4 mb-5">
          <div className="flex gap-3">
            {/* Image upload — top left */}
            <div className="flex-shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleImage(e.target.files[0])}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-1 transition-colors overflow-hidden"
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="product" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-[9px] text-gray-500">上传图片</span>
                  </>
                )}
              </button>
              {imagePreview && (
                <button
                  onClick={() => { setImage(null); setImagePreview(null) }}
                  className="mt-1 w-16 flex items-center justify-center gap-0.5 text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" /> 移除
                </button>
              )}
            </div>

            {/* Description textarea */}
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="描述你的产品：名称、核心功能、目标用户、主要卖点…&#10;例如：JOLIKE M5 MP3播放器，64g超轻，蓝牙5.3，全触控屏，适合跑步健身人群"
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:border-blue-400 leading-relaxed"
                rows={4}
              />

              {/* Parameters row */}
              <div className="flex items-center gap-3">
                {/* Count stepper */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 font-medium">版本数量</span>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                    <button
                      onClick={() => setCount(c => Math.max(1, c - 1))}
                      className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      -
                    </button>
                    <span className="text-sm font-semibold text-gray-800 w-6 text-center">{count}</span>
                    <button
                      onClick={() => setCount(c => Math.min(10, c + 1))}
                      className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Style selector */}
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-gray-600 font-medium">风格</span>
                  <div className="flex gap-1">
                    {STYLE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setStyle(opt.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          style === opt.value
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                        }`}
                        title={opt.desc}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={loading || !description.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {loading ? '生成中…' : '生成创意'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 border border-gray-200 rounded-2xl p-4 animate-pulse">
                <div className="flex gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gray-300" />
                  <div className="h-4 bg-gray-300 rounded w-48" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-300 rounded w-full" />
                  <div className="h-3 bg-gray-300 rounded w-4/5" />
                  <div className="h-3 bg-gray-300 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 font-medium">共生成 {results.length} 个创意角度</div>
            {results.map((r, i) => (
              <AngleCard key={i} result={r} idx={i} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
