import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  Check,
  Loader2,
  Copy,
  Film,
  Sparkles,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { VideoSkeleton } from '../components/ui/LoadingSkeleton'
import { MissingDataAlert } from '../components/ui/MissingDataAlert'
import { MainLayout } from '../components/layout/MainLayout'
import type { Video, Report, Progress } from '../types'

const STEPS = ['视频上传', '智能解析', '策略拆解', '提示词生成']
const TABS = ['营销策略', '分镜分析', '逆向提示词', '创意改写']

// ── Creative angle card (reused in tab 3) ────────────────────────────────────

interface CreativeAngle {
  index: number
  title: string
  hook_visual: string
  hook_copy: string
  concept: string
  why: string
}

interface CreativeResult {
  angle: CreativeAngle
  prompt: string
}

interface CreativeHistoryItem {
  id: string
  description: string
  results: CreativeResult[]
  created_at: string
}

const CARD_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', badge: 'bg-blue-500', tag: 'bg-blue-100 text-blue-700' },
  { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', badge: 'bg-purple-500', tag: 'bg-purple-100 text-purple-700' },
  { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', badge: 'bg-green-500', tag: 'bg-green-100 text-green-700' },
  { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-700', badge: 'bg-orange-500', tag: 'bg-orange-100 text-orange-700' },
  { bg: 'bg-pink-50', border: 'border-pink-200', title: 'text-pink-700', badge: 'bg-pink-500', tag: 'bg-pink-100 text-pink-700' },
]

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

function AngleCard({ result, idx }: { result: CreativeResult; idx: number }) {
  const [expanded, setExpanded] = useState(false)
  const color = CARD_COLORS[idx % CARD_COLORS.length]
  const { angle, prompt } = result
  return (
    <div className={`${color.bg} ${color.border} border rounded-2xl overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5 ${color.badge}`}>
            {idx + 1}
          </span>
          <h3 className={`text-sm font-bold ${color.title} leading-snug`}>{angle.title}</h3>
        </div>
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
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Concept</div>
          <p className="text-xs text-gray-700 leading-relaxed">{angle.concept}</p>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why it fits</div>
          <p className="text-xs text-gray-600 leading-relaxed italic">{angle.why}</p>
        </div>
      </div>
      {prompt && (
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
              <PromptBlock prompt={prompt} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ShotTimeline ─────────────────────────────────────────────────────────────

function parseTimestamp(ts: string): { start: number; end: number } | null {
  // Handles "0-2s", "3-7s", "0:00-0:05", "00:00-00:05"
  const rangeMatch = ts.match(/(\d+(?:\.\d+)?)[s:]?\s*[-–]\s*(\d+(?:\.\d+)?)s?/)
  if (rangeMatch) return { start: parseFloat(rangeMatch[1]), end: parseFloat(rangeMatch[2]) }
  const mmssMatch = ts.match(/(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)/)
  if (mmssMatch) {
    const start = parseInt(mmssMatch[1]) * 60 + parseInt(mmssMatch[2])
    const end = parseInt(mmssMatch[3]) * 60 + parseInt(mmssMatch[4])
    return { start, end }
  }
  return null
}

const TIMELINE_COLORS = [
  'bg-blue-400', 'bg-purple-400', 'bg-green-400', 'bg-orange-400',
  'bg-pink-400', 'bg-teal-400', 'bg-yellow-400', 'bg-red-400',
]

function ShotTimeline({ shots, frameUrls, videoRef }: { shots: any[]; frameUrls?: string[]; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const [active, setActive] = useState<number | null>(null)
  const parsed = shots.map(s => s.timestamp ? parseTimestamp(s.timestamp) : null)
  const totalEnd = parsed.reduce((max, p) => p ? Math.max(max, p.end) : max, 0)
  if (totalEnd === 0) return null

  const seekTo = (idx: number) => {
    const p = parsed[idx]
    if (p && videoRef.current) {
      videoRef.current.currentTime = p.start
      videoRef.current.play().catch(() => {})
    }
    setActive(idx)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-1">
      <div className="text-xs font-semibold text-gray-700 mb-3">分镜时间轴</div>
      <div className="relative">
        {/* Timeline bar */}
        <div className="relative h-2 flex rounded-full overflow-hidden gap-px bg-gray-200 mb-4">
          {shots.map((_shot, i) => {
            const p = parsed[i]
            if (!p) return null
            const width = ((p.end - p.start) / totalEnd) * 100
            const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length]
            return (
              <div
                key={i}
                style={{ width: `${width}%` }}
                className={`h-full ${color} ${active === i ? 'brightness-110' : ''}`}
              />
            )
          })}
        </div>

        {/* Shot thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {shots.map((shot, i) => {
            const p = parsed[i]
            const frameUrl = frameUrls?.[i]
            if (!p) return null
            return (
              <button
                key={i}
                onClick={() => seekTo(i)}
                className={`flex-shrink-0 group cursor-pointer ${active === i ? 'ring-2 ring-blue-500 rounded-lg' : ''}`}
              >
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mb-1">
                  {frameUrl ? (
                    <img src={frameUrl} alt={`场景${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">无图</div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-mono font-semibold text-gray-600">{shot.timestamp}</div>
                  <div className="text-[9px] text-gray-400">场景{shot.index || i + 1}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── AnalysisPage ─────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [video, setVideo] = useState<Video | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [progress, setProgress] = useState<Progress>({ upload: 0, parse: 0, strategy: 0, prompt: 0 })
  const [analysisStarting, setAnalysisStarting] = useState(false)

  // Video playback state
  const videoRef = useRef<HTMLVideoElement>(null)

  // Active tab state
  const [activeTab, setActiveTab] = useState(0)

  // Adapt (creative extension) state
  const [adaptImage, setAdaptImage] = useState<File | null>(null)
  const [adaptPreview, setAdaptPreview] = useState<string | null>(null)
  const [adaptDescription, setAdaptDescription] = useState('')
  const [adaptResult, setAdaptResult] = useState<CreativeResult[] | null>(null)
  const [adaptLoading, setAdaptLoading] = useState(false)
  const [adaptLoaded, setAdaptLoaded] = useState(false)

  // Creative rewrite history
  const [creativeHistory, setCreativeHistory] = useState<CreativeHistoryItem[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  const mainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startAnalysis = async () => {
    setAnalysisStarting(true)
    try {
      await axios.post(`/api/videos/${videoId}/analyze`)
    } catch (e: any) {
      alert('启动分析失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setAnalysisStarting(false)
    }
  }

  const fetchData = useCallback(async () => {
    if (!videoId) return
    try {
      const res = await axios.get(`/api/videos/${videoId}`)
      const v: Video = res.data.video
      setVideo(v)
      setProgress(res.data.progress || { upload: 0, parse: 0, strategy: 0, prompt: 0 })
      if (res.data.report) setReport(res.data.report)
      if (v.status === 'completed' || v.status === 'failed') {
        if (mainPollRef.current) {
          clearInterval(mainPollRef.current)
          mainPollRef.current = null
        }
      }
    } catch (e) {
      // ignore
    }
  }, [videoId])

  useEffect(() => {
    fetchData()
    mainPollRef.current = setInterval(fetchData, 3000)
    return () => {
      if (mainPollRef.current) {
        clearInterval(mainPollRef.current)
        mainPollRef.current = null
      }
    }
  }, [videoId, fetchData])

  const handleLoadedMetadata = () => {}

  const getStepStatus = (idx: number) => {
    const values = [progress.upload, progress.parse, progress.strategy, progress.prompt]
    if (values[idx] >= 100) return 'completed'
    if (values[idx] > 0) return 'active'
    return 'pending'
  }

  const handleAdaptImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAdaptImage(file)
    setAdaptPreview(URL.createObjectURL(file))
    setAdaptResult(null)
  }

  const submitAdapt = async () => {
    if (!videoId) return
    setAdaptLoading(true)
    try {
      const formData = new FormData()
      if (adaptImage) formData.append('image', adaptImage)
      formData.append('description', adaptDescription)
      formData.append('count', '5')
      formData.append('style', 'general')
      formData.append('video_id', videoId)
      const res = await axios.post('/api/creative/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAdaptResult(res.data.results || [])
      // Refresh history list
      const historyRes = await axios.get(`/api/creative/history?video_id=${videoId}`)
      setCreativeHistory(historyRes.data)
    } catch (e: any) {
      alert('创意改写失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setAdaptLoading(false)
    }
  }

  // Load existing linked creative records when tab 3 is first opened
  useEffect(() => {
    if (activeTab !== 3 || adaptLoaded || !videoId) return
    setAdaptLoaded(true)
    axios.get(`/api/creative/history?video_id=${videoId}`).then(res => {
      const items: CreativeHistoryItem[] = res.data
      setCreativeHistory(items)
    }).catch(() => {})
  }, [activeTab, adaptLoaded, videoId])

  // Parse shots: try JSON array, with fallback cleanup for malformed strings
  let parsedShots: any[] = []
  let shotsRaw = report?.shots || ''
  if (shotsRaw) {
    try {
      const p = JSON.parse(shotsRaw)
      if (Array.isArray(p)) parsedShots = p
    } catch {
      // Try cleaning common issues: stray quotes before { in array items
      try {
        const cleaned = shotsRaw
          .replace(/,\s*"\{/g, ', {')   // ,"{ → , {
          .replace(/\["\{/g, '[{')       // ["{ → [{
          .replace(/\}",/g, '},')        // }", → },
          .replace(/\}"\]/g, '}]')       // }"] → }]
        const p = JSON.parse(cleaned)
        if (Array.isArray(p)) parsedShots = p
      } catch { /* show raw */ }
    }
  }

  if (!video) return (
    <MainLayout>
      <div className="flex items-center justify-center min-h-screen p-8">
        <VideoSkeleton />
      </div>
    </MainLayout>
  )

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-8">
        {/* Page Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>
          <h1 className="text-lg font-heading font-semibold truncate flex-1">{video.filename}</h1>
        </div>

        {/* Progress Steps */}
        <div className="glass rounded-xl px-6 py-3 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {STEPS.map((step, idx) => {
              const status = getStepStatus(idx)
              return (
                <div key={step} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    status === 'completed' ? 'bg-status-success text-white' :
                    status === 'active' ? 'bg-accent text-white animate-pulse' :
                    'bg-gray-100 text-text-muted'
                  }`}>
                    {status === 'completed' ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className={`text-sm font-medium ${
                    status === 'completed' ? 'text-status-success' :
                    status === 'active' ? 'text-accent' :
                    'text-text-muted'
                  }`}>
                    {step}
                  </span>
                  {idx < STEPS.length - 1 && <div className="w-6 h-0.5 bg-gray-200" />}
                </div>
              )
            })}
          </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Video Player + Timeline + Segments */}
        <div className="space-y-4">
          {/* Video */}
          <div className="glass rounded-2xl overflow-hidden">
            <video
              ref={videoRef}
              src={`/api/videos/${videoId}/stream`}
              controls
              className="w-full"
              onLoadedMetadata={handleLoadedMetadata}
            />
          </div>

        </div>

        {/* Right: Tabbed Analysis Results */}
        <div className="space-y-4">
          {/* Error display */}
          {video?.status === 'failed' && (
            <div className="glass border border-status-error/30 rounded-xl p-4">
              <div className="text-sm font-semibold text-status-error mb-1 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                分析失败
              </div>
              <div className="text-xs text-status-error/80">{video.error || '未知错误，请检查模型配置和API Key'}</div>
            </div>
          )}

          {/* Start analysis button - show when no report OR when failed (retry) */}
          {!report && (
            <div className="glass rounded-xl p-6 text-center">
              <div className="text-text-secondary text-sm mb-4">
                {video?.status === 'failed' ? '分析失败，点击重新分析' : '视频已上传，点击开始分析'}
              </div>
              <button
                onClick={startAnalysis}
                disabled={analysisStarting}
                className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all ${
                  analysisStarting
                    ? 'bg-white/10 text-text-muted cursor-not-allowed'
                    : 'bg-accent text-white hover:bg-accent/90 shadow-lg hover:shadow-accent/20'
                }`}
              >
                {analysisStarting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    分析中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Film className="w-4 h-4" />
                    开始分析
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Missing data alert */}
          {report && (() => {
            const missing = []
            if (!report.script) missing.push({ name: '语音文字稿', description: '未检测到语音内容，分镜对话字段将为空', required: true })
            // Only warn if shots is null/undefined, not empty string (empty string means parse failed but model returned something)
            if (report.shots === null || report.shots === undefined) missing.push({ name: '分镜场景分析', description: '综合分析模型未返回分镜数据，场景描述可能不完整', required: true })
            if (!video?.platform) missing.push({ name: '视频主题/类型', description: '补充平台信息可提升策略分析准确度', required: false })
            return missing.length > 0 ? <MissingDataAlert missingFields={missing} /> : null
          })()}

          {/* Re-analyze button - show when report exists */}
          {report && (
            <div className="flex justify-end">
              <button
                onClick={startAnalysis}
                disabled={analysisStarting || video?.status === 'processing'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary border border-white/20 rounded-lg hover:bg-white/5 hover:text-text-primary transition-all disabled:opacity-40"
              >
                <Loader2 className={`w-3.5 h-3.5 ${analysisStarting ? 'animate-spin' : ''}`} />
                重新分析
              </button>
            </div>
          )}

          {/* Tab buttons */}
          {report && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex border-b border-white/10">
                {TABS.map((tab, idx) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(idx)}
                    className={`flex-1 py-3 text-sm font-medium transition-all border-b-2 ${
                      activeTab === idx
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {/* Tab 0: 营销策略 */}
                {activeTab === 0 && (
                  <div className="space-y-4">
                    {report.strategy ? (
                      <StrategyView strategy={report.strategy} />
                    ) : (
                      <div className="text-sm text-gray-400 text-center py-8">分析中...</div>
                    )}
                  </div>
                )}

                {/* Tab 1: 分镜分析 */}
                {activeTab === 1 && (
                  <div className="space-y-4 overflow-y-auto max-h-[600px]">
                    {parsedShots.length > 0 ? (
                      <div className="space-y-3">
                        <ShotTimeline shots={parsedShots} frameUrls={report.frame_urls ?? undefined} videoRef={videoRef} />
                        {parsedShots.map((shot: any, i: number) => {
                          const frameUrl = report.frame_urls?.[i]
                          const hasDialogue = shot.dialogue && shot.dialogue !== 'null' && shot.dialogue !== '字幕by索兰娅'
                          return (
                            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                              <div className="flex gap-3 p-3">
                                {/* Frame thumbnail */}
                                <div className="flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                  {frameUrl ? (
                                    <img src={frameUrl} alt={`场景${i + 1}`} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">无图</div>
                                  )}
                                </div>
                                {/* Shot info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {shot.timestamp && (
                                      <span className="text-[10px] font-mono font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">{shot.timestamp}</span>
                                    )}
                                    <span className="text-xs font-semibold text-gray-800">场景 {shot.index || i + 1}</span>
                                    {shot.camera_angle && (
                                      <span className="text-[10px] text-gray-400 ml-auto">{shot.camera_angle}</span>
                                    )}
                                  </div>
                                  {shot.description && (
                                    <p className="text-xs text-gray-700 leading-relaxed">{shot.description}</p>
                                  )}
                                  {shot.purpose && (
                                    <p className="text-[10px] text-gray-400 mt-0.5 italic">{shot.purpose}</p>
                                  )}
                                </div>
                              </div>
                              {hasDialogue && (
                                <div className="border-t border-gray-100 px-3 py-2 flex gap-2">
                                  <span className="text-[10px] font-semibold text-blue-500 flex-shrink-0 mt-0.5">台词</span>
                                  <span className="text-xs text-gray-700 leading-relaxed">"{shot.dialogue}"</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : shotsRaw ? (
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 border border-gray-200 p-3 rounded overflow-x-auto">{shotsRaw}</pre>
                    ) : (
                      <div className="text-sm text-gray-400 text-center py-8">分析中...</div>
                    )}

                    {/* Whisper transcript */}
                    {report.script_segments && (() => {
                      try {
                        const segs: Array<{start: number, end: number, text: string}> = JSON.parse(report.script_segments!)
                        if (!segs.length) return null
                        const sentences: Array<{start: number, end: number, text: string}> = []
                        for (const seg of segs) {
                          const last = sentences[sentences.length - 1]
                          const gap = last ? seg.start - last.end : Infinity
                          const tooLong = last ? (last.end - last.start) > 10 : false
                          if (!last || gap > 1.5 || tooLong) {
                            sentences.push({ start: seg.start, end: seg.end, text: seg.text.trim() })
                          } else {
                            last.end = seg.end
                            last.text += seg.text.trim()
                          }
                        }
                        return (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">语音完整台词</div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                              {sentences.map((s, i) => (
                                <div key={i} className="flex items-start gap-3 text-xs">
                                  <span className="font-mono text-accent bg-accent/10 px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                                    {s.start.toFixed(1)}s
                                  </span>
                                  <span className="text-gray-700 leading-relaxed">{s.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      } catch { return null }
                    })()}
                  </div>
                )}

                {/* Tab 2: 逆向提示词 */}
                {activeTab === 2 && (
                  <div className="space-y-4">
                    {report.prompt ? (
                      <PromptRecView prompt={report.prompt} />
                    ) : (
                      <div className="text-sm text-gray-400 text-center py-8">分析中...</div>
                    )}
                  </div>
                )}

                {/* Tab 3: 创意改写 */}
                {activeTab === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs text-gray-500">
                      AI 将读取本视频的内容钩子分析和情感共鸣点，结合你的产品信息，生成多个创意角度和视频提示词
                    </div>

                    {/* Input row: image upload (top-left) + description */}
                    <div className="flex gap-3">
                      {/* Image upload */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <label className="w-16 h-16 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-1 cursor-pointer overflow-hidden transition-colors">
                          {adaptPreview
                            ? <img src={adaptPreview} alt="product" className="w-full h-full object-cover" />
                            : <>
                                <span className="text-xl">📷</span>
                                <span className="text-[9px] text-gray-500">上传图片</span>
                              </>
                          }
                          <input type="file" accept="image/*" onChange={handleAdaptImage} className="hidden" />
                        </label>
                        {adaptPreview && (
                          <button
                            onClick={() => { setAdaptImage(null); setAdaptPreview(null); setAdaptResult(null) }}
                            className="text-[10px] text-red-400 hover:text-red-300"
                          >移除</button>
                        )}
                      </div>

                      {/* Description + button */}
                      <div className="flex-1 flex flex-col gap-2">
                        <textarea
                          value={adaptDescription}
                          onChange={e => setAdaptDescription(e.target.value)}
                          placeholder="输入你的产品描述（可选）：名称、核心功能、目标用户…"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-500 resize-none focus:outline-none focus:border-accent/50"
                          rows={3}
                        />
                        <button
                          onClick={submitAdapt}
                          disabled={adaptLoading}
                          className="self-end flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all hover:opacity-90"
                        >
                          {adaptLoading
                            ? <><Loader2 className="w-4 h-4 animate-spin" />生成中…</>
                            : <><Sparkles className="w-4 h-4" />生成创意</>
                          }
                        </button>
                      </div>
                    </div>

                    {/* Loading skeleton */}
                    {adaptLoading && (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 animate-pulse">
                            <div className="flex gap-3 mb-3">
                              <div className="w-6 h-6 rounded-full bg-white/10" />
                              <div className="h-4 bg-white/10 rounded w-48" />
                            </div>
                            <div className="space-y-2">
                              <div className="h-3 bg-white/10 rounded w-full" />
                              <div className="h-3 bg-white/10 rounded w-4/5" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Current results */}
                    {!adaptLoading && adaptResult && adaptResult.length > 0 && (
                      <div className="space-y-4">
                        <div className="text-xs text-gray-400">共生成 {adaptResult.length} 个创意角度</div>
                        {adaptResult.map((r, i) => <AngleCard key={i} result={r} idx={i} />)}
                      </div>
                    )}

                    {/* ── History sub-records ── */}
                    {creativeHistory.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-white/10">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-accent to-purple-500" />
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">历史改写记录</span>
                          <span className="ml-auto text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">{creativeHistory.length} 条</span>
                        </div>
                        <div className="space-y-2">
                          {creativeHistory.map((item) => {
                            const isExpanded = expandedHistoryId === item.id
                            const date = new Date(item.created_at)
                            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
                            const preview = item.description?.trim() || '（无产品描述）'
                            return (
                              <div key={item.id} className="rounded-xl border border-white/10 bg-white/3 overflow-hidden transition-all">
                                {/* Row header — always visible */}
                                <button
                                  onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                                >
                                  {/* Colored dot */}
                                  <span className="w-2 h-2 rounded-full bg-gradient-to-br from-accent to-purple-500 flex-shrink-0" />
                                  {/* Description preview */}
                                  <span className="flex-1 text-xs text-gray-700 truncate">{preview}</span>
                                  {/* Angle count badge */}
                                  <span className="flex-shrink-0 text-[10px] font-medium text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full">
                                    {item.results.length} 个角度
                                  </span>
                                  {/* Date */}
                                  <span className="flex-shrink-0 text-[10px] text-gray-400 font-mono">{dateStr}</span>
                                  {/* Chevron */}
                                  {isExpanded
                                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  }
                                </button>
                                {/* Expanded angle cards */}
                                {isExpanded && (
                                  <div className="px-3 pb-3 space-y-3 border-t border-white/10 pt-3">
                                    {item.description && (
                                      <div className="text-xs text-gray-500 bg-white/5 rounded-lg px-3 py-2 leading-relaxed">
                                        {item.description}
                                      </div>
                                    )}
                                    {item.results.map((r, i) => <AngleCard key={i} result={r} idx={i} />)}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </MainLayout>
  )
}

// ── StrategyView ──────────────────────────────────────────────────────────────

const SECTION_STYLES: Record<string, { bg: string; border: string; title: string; icon: string }> = {
  '核心营销策略': { bg: 'bg-blue-50',   border: 'border-blue-200',   title: 'text-blue-700',   icon: '🎯' },
  '目标受众':     { bg: 'bg-green-50',  border: 'border-green-200',  title: 'text-green-700',  icon: '👥' },
  '内容钩子':     { bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', icon: '🔗' },
  '情感共鸣':     { bg: 'bg-pink-50',   border: 'border-pink-200',   title: 'text-pink-700',   icon: '💡' },
  '传播潜力':     { bg: 'bg-yellow-50', border: 'border-yellow-200', title: 'text-yellow-700', icon: '📈' },
  '复制建议':     { bg: 'bg-teal-50',   border: 'border-teal-200',   title: 'text-teal-700',   icon: '📋' },
  '痛点':         { bg: 'bg-red-50',    border: 'border-red-200',    title: 'text-red-700',    icon: '⚡' },
  'CTA':          { bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-700', icon: '📣' },
}

function getSectionStyle(title: string) {
  if (SECTION_STYLES[title]) return SECTION_STYLES[title]
  for (const key of Object.keys(SECTION_STYLES)) {
    if (title.includes(key) || key.includes(title)) return SECTION_STYLES[key]
  }
  return { bg: 'bg-gray-50', border: 'border-gray-200', title: 'text-gray-700', icon: '📌' }
}

// Markdown components — explicit dark colors so they work on any background
const mdComponents = {
  table: ({ ...props }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse" {...props} /></div>,
  thead: ({ ...props }) => <thead className="bg-gray-100" {...props} />,
  th: ({ ...props }) => <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-gray-800" {...props} />,
  td: ({ ...props }) => <td className="border border-gray-300 px-2 py-1.5 text-gray-700" {...props} />,
  tr: ({ ...props }) => <tr className="even:bg-gray-50" {...props} />,
  p: ({ ...props }) => <p className="text-sm text-gray-800 leading-relaxed mb-1.5 last:mb-0" {...props} />,
  li: ({ ...props }) => <li className="text-sm text-gray-800 leading-relaxed" {...props} />,
  ul: ({ ...props }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5 text-gray-800" {...props} />,
  ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5 text-gray-800" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
  em: ({ ...props }) => <em className="italic text-gray-700" {...props} />,
  blockquote: ({ ...props }) => <blockquote className="border-l-2 border-gray-400 pl-3 text-gray-700 italic my-1.5" {...props} />,
  code: ({ ...props }) => <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono" {...props} />,
  pre: ({ ...props }) => <pre className="bg-gray-100 text-gray-800 p-3 rounded-lg text-xs overflow-x-auto my-2 font-mono" {...props} />,
  h3: ({ ...props }) => <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-1 border-b border-gray-200 pb-0.5" {...props} />,
  h4: ({ ...props }) => <h4 className="text-xs font-semibold text-gray-700 mt-2 mb-1" {...props} />,
  hr: () => <hr className="border-gray-200 my-2" />,
}

function parseMarkdownSections(raw: string): Array<[string, string]> {
  // Strip <think>...</think>
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const sections: Array<[string, string]> = []
  let title = ''
  let content: string[] = []

  for (const line of text.split('\n')) {
    // Only split cards on ## (top-level sections); ### stays as content inside the card
    const hMatch = line.match(/^#{2}\s+(.+)/)
    if (hMatch) {
      const t = hMatch[1].replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').replace(/[*_]/g, '').trim()
      // Skip generic wrapper titles
      if (/^(TikTok|报告|模板|说明|预览|如果|请您|补充|⚠)/.test(t)) { title = ''; content = []; continue }
      if (title && content.join('').trim()) sections.push([title, content.join('\n').trim()])
      title = t
      content = []
    } else if (title) {
      // Demote ### to #### so they render as sub-headers within the card, not card titles
      content.push(line.replace(/^###\s+/, '#### '))
    }
  }
  if (title && content.join('').trim()) sections.push([title, content.join('\n').trim()])
  return sections
}

function StrategyView({ strategy }: { strategy: string }) {
  // Try JSON first
  let jsonSections: Array<[string, string]> | null = null
  try {
    const p = JSON.parse(strategy)
    if (typeof p === 'object' && !Array.isArray(p)) {
      const candidates: Array<[string, string]> = [
        ['核心营销策略', p['核心营销策略'] || p['core_strategy'] || ''],
        ['目标受众',    p['目标受众'] || p['target_audience'] || ''],
        ['内容钩子',    p['内容钩子'] || p['hook'] || ''],
        ['情感共鸣',    p['情感共鸣'] || p['emotional_hooks'] || ''],
        ['传播潜力',    p['传播潜力'] || p['spread'] || ''],
        ['复制建议',    p['复制建议'] || p['replication_tips'] || p['tips'] || ''],
      ].filter(([, v]) => v) as Array<[string, string]>
      if (candidates.length > 0) jsonSections = candidates
    }
  } catch { /* use markdown path */ }

  const sections = jsonSections ?? parseMarkdownSections(strategy)

  if (sections.length > 0) {
    return (
      <div className="space-y-3 overflow-y-auto max-h-[600px]">
        {sections.map(([title, content], idx) => {
          const style = getSectionStyle(title)
          return (
            <div key={idx} className={`${style.bg} ${style.border} border rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${style.title.replace('text-', 'bg-').replace('-700', '-500').replace('-600', '-500')}`}>
                  {idx + 1}
                </span>
                <span className={`text-xs font-bold ${style.title}`}>{style.icon} {title}</span>
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {content}
              </ReactMarkdown>
            </div>
          )
        })}
      </div>
    )
  }

  // Bare fallback — render as markdown too
  return (
    <div className="text-sm text-gray-800 leading-relaxed p-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {strategy.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}
      </ReactMarkdown>
    </div>
  )
}



// ── PromptRecView ─────────────────────────────────────────────────────────────

function PromptRecView({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false)
  if (!prompt) return <div className="text-sm text-gray-400 text-center py-8">暂无提示词</div>

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">可直接粘贴到 Sora / 即梦 / Kling / Pika</div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 border border-gray-200 p-4 rounded-xl overflow-y-auto max-h-[520px] leading-relaxed font-sans">
        {prompt}
      </pre>
      <button
        onClick={handleCopy}
        className="w-full py-2.5 bg-accent hover:bg-accent/90 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? '已复制到剪贴板' : '复制完整 Prompt'}
      </button>
    </div>
  )
}
