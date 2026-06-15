import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { X, Sparkles, Copy, Check, ChevronDown, ChevronUp, Loader2, ImageIcon, Minus, Plus, Wand2 } from 'lucide-react'
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

// Warm gradient backgrounds for cards — avoids blue/purple
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fdf2f8 100%)',
  'linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)',
  'linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%)',
]

const CARD_ACCENTS = [
  { badge: 'bg-amber-500', title: 'text-amber-800', tag: 'bg-amber-100 text-amber-700' },
  { badge: 'bg-pink-500', title: 'text-pink-800', tag: 'bg-pink-100 text-pink-700' },
  { badge: 'bg-emerald-500', title: 'text-emerald-800', tag: 'bg-emerald-100 text-emerald-700' },
  { badge: 'bg-indigo-500', title: 'text-indigo-800', tag: 'bg-indigo-100 text-indigo-700' },
  { badge: 'bg-orange-500', title: 'text-orange-800', tag: 'bg-orange-100 text-orange-700' },
]

// ── Prompt Block ──────────────────────────────────────────
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
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-300 tracking-tight">Video Prompt</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="p-3.5 space-y-2">
        {sections.length > 0 ? sections.map(([tag, content], i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="text-amber-400 font-mono font-semibold whitespace-nowrap flex-shrink-0">[{tag}]</span>
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

// ── Angle Card ────────────────────────────────────────────
function AngleCard({ result, idx }: { result: CreativeResult; idx: number }) {
  const [expanded, setExpanded] = useState(false)
  const { angle, prompt } = result
  const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length]

  return (
    <div
      className="card rounded-xl overflow-hidden animate-slideUp"
      style={{ background: CARD_GRADIENTS[idx % CARD_GRADIENTS.length] }}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${accent.badge}`}>
            {idx + 1}
          </span>
          <h3 className={`text-base font-bold ${accent.title} leading-snug tracking-tight`}>{angle.title}</h3>
        </div>

        {/* Hook */}
        <div className="mb-4 space-y-2">
          <div className="flex gap-2.5">
            <span className={`tag ${accent.tag}`}>视觉</span>
            <p className="text-sm text-gray-700 leading-relaxed flex-1">{angle.hook_visual}</p>
          </div>
          <div className="flex gap-2.5">
            <span className={`tag ${accent.tag}`}>文案</span>
            <p className="text-sm text-gray-800 font-medium leading-relaxed flex-1">"{angle.hook_copy}"</p>
          </div>
        </div>

        {/* Concept + Why in two columns */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Concept</div>
            <p className="text-sm text-gray-700 leading-relaxed">{angle.concept}</p>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Why it fits</div>
            <p className="text-sm text-gray-600 leading-relaxed italic">{angle.why}</p>
          </div>
        </div>
      </div>

      {/* Prompt toggle */}
      <div className="border-t border-black/5">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:bg-black/[0.03] transition-colors cursor-pointer"
        >
          <span>查看 Video Prompt</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {expanded && (
          <div className="px-5 pb-4">
            {prompt ? (
              <PromptBlock prompt={prompt} />
            ) : (
              <div className="mt-3 bg-gray-100 rounded-xl p-3 text-sm text-gray-500 text-center">
                Prompt 生成失败
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────
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
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16 animate-fadeIn">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[1.75rem] font-bold text-gray-900 tracking-tight"
            style={{ letterSpacing: '-0.03em' }}>
            创意生成
          </h1>
          <p className="text-[15px] text-gray-500 mt-1.5">
            输入产品描述或上传图片，AI 为你生成多种营销角度和视频提示词
          </p>
        </div>

        {/* Input area — vertical stack, more breathing room */}
        <div className="card rounded-xl p-6 mb-8">
          {/* Textarea — full width */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述你的产品：名称、核心功能、目标用户、主要卖点…&#10;例如：JOLIKE M5 MP3播放器，64g超轻，蓝牙5.3，全触控屏，适合跑步健身人群"
            className="w-full bg-gray-50 rounded-xl px-4 py-3.5 text-[15px] text-gray-900 placeholder-gray-400 resize-none mb-4 leading-relaxed"
            style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)' }}
            rows={3}
          />

          {/* Bottom bar: image upload + controls + submit */}
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Image upload */}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleImage(e.target.files[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 flex flex-col items-center justify-center gap-0.5 transition-colors overflow-hidden cursor-pointer"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="product" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-[9px] text-gray-400">图片</span>
                    </>
                  )}
                </button>
                {imagePreview && (
                  <button
                    onClick={() => { setImage(null); setImagePreview(null) }}
                    className="mt-1 w-14 flex items-center justify-center text-[10px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" /> 移除
                  </button>
                )}
              </div>

              {/* Count stepper */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium">数量</span>
                <div className="flex items-center bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setCount(c => Math.max(1, c - 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-sm font-semibold text-gray-800 w-8 text-center tabular-nums">{count}</span>
                  <button
                    onClick={() => setCount(c => Math.min(10, c + 1))}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Style selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium">风格</span>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                  {STYLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStyle(opt.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                        style === opt.value
                          ? 'bg-amber-500 text-white shadow-amber'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-[15px] font-semibold text-white transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: loading ? '#92400e' : '#d97706',
                boxShadow: '0 1px 3px rgba(217,119,6,0.25)',
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#b45309' }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#d97706' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {loading ? '生成中…' : '生成创意'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-sm text-red-700 rounded-xl animate-slideUp"
            style={{ boxShadow: '0 0 0 1px rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card rounded-xl p-5 animate-pulse">
                <div className="flex gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-gray-200" />
                  <div className="h-5 bg-gray-200 rounded w-48" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full" />
                  <div className="h-3 bg-gray-200 rounded w-4/5" />
                  <div className="h-3 bg-gray-200 rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results — 2-column grid */}
        {!loading && results.length > 0 && (
          <>
            <div className="text-sm text-gray-400 font-medium mb-4">
              共生成 {results.length} 个创意角度
            </div>
            <div className="grid grid-cols-2 gap-4">
              {results.map((r, i) => (
                <AngleCard key={i} result={r} idx={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}
