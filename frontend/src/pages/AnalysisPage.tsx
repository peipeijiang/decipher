import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { Video, Report, Progress, Segment } from '../types'

const STEPS = ['视频上传', '智能解析', '策略拆解', '提示词生成']

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function SegmentStatusBadge({
  status,
  onAnalyze,
}: {
  status: string | null | undefined
  onAnalyze: () => void
}) {
  if (status === 'completed') {
    return <span className="text-green-600 font-medium text-xs">✓ 已分析</span>
  }
  if (status === 'processing') {
    return <span className="text-gray-400 text-xs animate-pulse">分析中...</span>
  }
  return (
    <button
      className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:opacity-40"
      onClick={onAnalyze}
    >
      分析
    </button>
  )
}

// ── VideoTimeline ────────────────────────────────────────────────────────────

interface TimelineProps {
  duration: number
  currentTime: number
  startTime: number
  endTime: number
  segments: Segment[]
  onStartChange: (t: number) => void
  onEndChange: (t: number) => void
  onSeek: (t: number) => void
}

function VideoTimeline({
  duration,
  currentTime,
  startTime,
  endTime,
  segments,
  onStartChange,
  onEndChange,
  onSeek,
}: TimelineProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start' | 'end' | null>(null)

  const ratio = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const timeFromEvent = useCallback(
    (clientX: number) => {
      if (!barRef.current || duration === 0) return 0
      const rect = barRef.current.getBoundingClientRect()
      const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return r * duration
    },
    [duration],
  )

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return
      const t = timeFromEvent(e.clientX)
      if (dragging.current === 'start') {
        onStartChange(Math.min(t, endTime - 0.5))
      } else {
        onEndChange(Math.max(t, startTime + 0.5))
      }
    },
    [timeFromEvent, startTime, endTime, onStartChange, onEndChange],
  )

  const onMouseUp = useCallback(() => {
    dragging.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const handleBarClick = (e: React.MouseEvent) => {
    if (dragging.current) return
    onSeek(timeFromEvent(e.clientX))
  }

  if (duration === 0) {
    return (
      <div className="h-8 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
        加载视频中...
      </div>
    )
  }

  return (
    <div className="select-none">
      {/* Bar */}
      <div
        ref={barRef}
        className="relative h-8 bg-gray-200 rounded cursor-pointer"
        onClick={handleBarClick}
      >
        {/* Existing segments (background markers) */}
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="absolute top-0 h-full bg-green-200 opacity-50 pointer-events-none"
            style={{ left: `${ratio(seg.start_time)}%`, width: `${ratio(seg.end_time - seg.start_time)}%` }}
          />
        ))}

        {/* Selection range highlight */}
        <div
          className="absolute top-0 h-full bg-blue-300 opacity-60 pointer-events-none"
          style={{ left: `${ratio(startTime)}%`, width: `${ratio(endTime - startTime)}%` }}
        />

        {/* Current time playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-red-500 pointer-events-none"
          style={{ left: `${ratio(currentTime)}%` }}
        />

        {/* Start handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow cursor-ew-resize z-10"
          style={{ left: `${ratio(startTime)}%`, transform: 'translate(-50%, -50%)' }}
          onMouseDown={(e) => { e.stopPropagation(); dragging.current = 'start' }}
        />

        {/* End handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow cursor-ew-resize z-10"
          style={{ left: `${ratio(endTime)}%`, transform: 'translate(-50%, -50%)' }}
          onMouseDown={(e) => { e.stopPropagation(); dragging.current = 'end' }}
        />
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}

// ── SegmentList ──────────────────────────────────────────────────────────────

interface SegmentListProps {
  segments: Segment[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onSeek: (t: number) => void
  onAnalyze: (id: string) => void
}

function SegmentList({ segments, selectedId, onSelect, onDelete, onSeek, onAnalyze }: SegmentListProps) {
  if (segments.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-3">
        暂无片段，在时间轴上选择区间后点击「创建片段」
      </div>
    )
  }

  return (
    <ul className="space-y-1">
      {segments.map((seg) => (
        <li
          key={seg.id}
          className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
            selectedId === seg.id ? 'bg-blue-50 border border-blue-300' : 'bg-gray-50 hover:bg-gray-100'
          }`}
          onClick={() => { onSelect(seg.id); onSeek(seg.start_time) }}
        >
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="flex-1 font-medium truncate">{seg.label}</span>
          <span className="text-gray-400 tabular-nums">
            {formatTime(seg.start_time)} – {formatTime(seg.end_time)}
          </span>
          <span onClick={(e) => e.stopPropagation()}>
            <SegmentStatusBadge
              status={seg.analysis_status}
              onAnalyze={() => onAnalyze(seg.id)}
            />
          </span>
          <button
            className="text-gray-400 hover:text-red-500 ml-1"
            onClick={(e) => { e.stopPropagation(); onDelete(seg.id) }}
            title="删除片段"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── AnalysisPage ─────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [video, setVideo] = useState<Video | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [progress, setProgress] = useState<Progress>({ upload: 0, parse: 0, strategy: 0, prompt: 0 })
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [analysisStarting, setAnalysisStarting] = useState(false)

  // Video playback state
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Timeline selection state
  const [selStart, setSelStart] = useState(0)
  const [selEnd, setSelEnd] = useState(0)

  // Segments state
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null)
  const [segLabel, setSegLabel] = useState('')

  // Polling for segment analysis
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Polling for main video/progress/report
  const mainPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSegments = useCallback(async () => {
    if (!videoId) return
    try {
      const res = await axios.get(`/api/videos/${videoId}/segments`)
      setSegments(res.data)
    } catch (e) {
      // ignore
    }
  }, [videoId])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const startPolling = useCallback((segmentId: string) => {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/api/segments/${segmentId}`)
        const seg: Segment = res.data
        if (seg.analysis_status === 'completed' || seg.analysis_status === 'failed') {
          stopPolling()
          // Refresh full segment list so all statuses and prompts are up to date
          fetchSegments()
        } else {
          // Update just this segment in place
          setSegments((prev) => prev.map((s) => (s.id === segmentId ? seg : s)))
        }
      } catch (e) {
        stopPolling()
      }
    }, 3000)
  }, [stopPolling, fetchSegments])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const analyzeSegment = async (segmentId: string) => {
    // Optimistically mark as processing
    setSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, analysis_status: 'processing' } : s))
    )
    try {
      await axios.post(`/api/segments/${segmentId}/analyze`)
      startPolling(segmentId)
    } catch (e) {
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, analysis_status: null } : s))
      )
    }
  }

  const startAnalysis = async () => {
    setAnalysisStarting(true)
    try {
      await axios.post(`/api/videos/${videoId}/analyze`)
      // Will be picked up by existing poll
    } catch (e: any) {
      alert('启动分析失败：' + (e.response?.data?.detail || e.message))
    } finally {
      setAnalysisStarting(false)
    }
  }

  const notesInitialized = useRef(false)

  const fetchData = useCallback(async () => {
    if (!videoId) return
    try {
      const res = await axios.get(`/api/videos/${videoId}`)
      const v: Video = res.data.video
      setVideo(v)
      if (!notesInitialized.current) {
        setNotes(v.notes ?? '')
        notesInitialized.current = true
      }
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
    fetchSegments()
    mainPollRef.current = setInterval(fetchData, 3000)
    return () => {
      if (mainPollRef.current) {
        clearInterval(mainPollRef.current)
        mainPollRef.current = null
      }
    }
  }, [videoId, fetchData, fetchSegments])

  // Init selection when duration is known
  const handleLoadedMetadata = () => {
    const d = videoRef.current?.duration ?? 0
    setDuration(d)
    setSelStart(0)
    setSelEnd(Math.min(d, 10))
  }

  const handleTimeUpdate = () => {
    setCurrentTime(videoRef.current?.currentTime ?? 0)
  }

  const seek = useCallback((t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t
  }, [])

  const saveNotes = async () => {
    if (!videoId) return
    setSavingNotes(true)
    try {
      await axios.patch(`/api/reports/${videoId}`, { notes })
    } catch (e) {
      // ignore
    } finally {
      setSavingNotes(false)
    }
  }

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getStepStatus = (idx: number) => {
    const values = [progress.upload, progress.parse, progress.strategy, progress.prompt]
    if (values[idx] >= 100) return 'completed'
    if (values[idx] > 0) return 'active'
    if (idx === 0 && video) return 'active'
    return 'pending'
  }

  const createSegment = async () => {
    if (!videoId) return
    const label = segLabel.trim() || `片段 ${segments.length + 1}`
    try {
      const res = await axios.post(`/api/videos/${videoId}/segments`, {
        label,
        start_time: selStart,
        end_time: selEnd,
      })
      setSegments((prev) => [...prev, res.data])
      setSelectedSegId(res.data.id)
      setSegLabel('')
    } catch (e) {
      // ignore
    }
  }

  const deleteSegment = async (id: string) => {
    try {
      await axios.delete(`/api/segments/${id}`)
      setSegments((prev) => prev.filter((s) => s.id !== id))
      if (selectedSegId === id) setSelectedSegId(null)
    } catch (e) {
      // ignore
    }
  }

  const selectedSeg = segments.find((s) => s.id === selectedSegId) ?? null

  if (!video) return <div className="p-8 text-center">加载中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Bar */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              ← 返回首页
            </button>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((step, idx) => {
              const status = getStepStatus(idx)
              return (
                <div key={step} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    status === 'completed' ? 'bg-green-500 text-white' :
                    status === 'active' ? 'bg-blue-500 text-white animate-pulse' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {status === 'completed' ? '✓' : idx + 1}
                  </div>
                  <span className={`text-sm ${status === 'completed' ? 'text-green-600' : status === 'active' ? 'text-blue-600' : 'text-gray-400'}`}>
                    {step}
                  </span>
                  {idx < STEPS.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-2 gap-8">
        {/* Left: Video Player + Timeline + Segments */}
        <div className="space-y-4">
          {/* Video */}
          <video
            ref={videoRef}
            src={`/api/videos/${videoId}/stream`}
            controls
            className="w-full rounded-lg shadow"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 text-sm">时间轴选择</h3>
              <span className="text-xs text-gray-500 tabular-nums">
                当前 {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <VideoTimeline
              duration={duration}
              currentTime={currentTime}
              startTime={selStart}
              endTime={selEnd}
              segments={segments}
              onStartChange={setSelStart}
              onEndChange={setSelEnd}
              onSeek={seek}
            />

            {/* Selection info + quick-set buttons */}
            <div className="flex items-center gap-2 text-sm">
              <button
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                onClick={() => setSelStart(currentTime)}
                title="将当前播放位置设为起点"
              >
                ▶ 设为起点
              </button>
              <span className="text-blue-600 font-mono tabular-nums flex-1 text-center">
                {formatTime(selStart)} → {formatTime(selEnd)}
                <span className="text-gray-400 ml-1">({formatTime(selEnd - selStart)})</span>
              </span>
              <button
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
                onClick={() => setSelEnd(currentTime)}
                title="将当前播放位置设为终点"
              >
                ▶ 设为终点
              </button>
            </div>

            {/* Create segment */}
            <div className="flex gap-2">
              <input
                type="text"
                value={segLabel}
                onChange={(e) => setSegLabel(e.target.value)}
                placeholder={`片段 ${segments.length + 1}`}
                className="flex-1 border rounded px-2 py-1 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') createSegment() }}
              />
              <button
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-40"
                onClick={createSegment}
                disabled={selEnd <= selStart || duration === 0}
              >
                创建片段
              </button>
            </div>
          </div>

          {/* Segment list */}
          <div className="bg-white rounded-lg shadow p-4 space-y-2">
            <h3 className="font-medium text-gray-900 text-sm">
              已创建片段
              {segments.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                  {segments.length}
                </span>
              )}
            </h3>
            <SegmentList
              segments={segments}
              selectedId={selectedSegId}
              onSelect={setSelectedSegId}
              onDelete={deleteSegment}
              onSeek={seek}
              onAnalyze={analyzeSegment}
            />

            {/* Selected segment prompt */}
            {selectedSeg?.analysis_status === 'completed' && selectedSeg.prompt && (
              <div className="mt-3 border-t pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-gray-700">片段提示词 — {selectedSeg.label}</span>
                  <button
                    className="text-xs text-blue-600 hover:text-blue-700"
                    onClick={() => copyPrompt(selectedSeg.prompt!)}
                  >
                    复制
                  </button>
                </div>
                <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded max-h-40 overflow-y-auto">
                  {selectedSeg.prompt}
                </div>
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-100">
                  <div className="text-xs text-green-600">
                    <span className="font-medium">复刻用法：</span>复制此片段 Prompt，粘贴到即梦/ Sora 中生成对应片段视频
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Video info */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">视频信息</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div>时长：{video.duration ? formatTime(video.duration) : '-'}</div>
              <div>平台：{video.platform || 'TikTok'}</div>
              <div>点赞：{video.likes || '-'}</div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">备注</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                disabled={savingNotes}
                className="w-full border rounded p-2 text-sm"
                rows={2}
                placeholder="添加备注..."
              />
            </div>
          </div>
        </div>

        {/* Right: Analysis Results */}
        <div className="space-y-4">
          {/* Error display */}
          {video?.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-red-700 mb-1">⚠️ 分析失败</div>
              <div className="text-xs text-red-600">{video.error || '未知错误，请检查模型配置和API Key'}</div>
            </div>
          )}

          {/* Start analysis button */}
          {!report && video?.status !== 'failed' && (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="text-gray-500 text-sm mb-4">视频已上传，点击开始分析</div>
              <button
                onClick={startAnalysis}
                disabled={analysisStarting}
                className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all ${
                  analysisStarting
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {analysisStarting ? '分析中...' : '🎬 开始分析'}
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">智能策略分析</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {report?.strategy || '分析中...'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">分镜场景分析</h3>
            <div className="text-sm text-gray-700">
              {report?.shots ? (() => {
                try {
                  const parsed = JSON.parse(report.shots)
                  if (Array.isArray(parsed)) {
                    return parsed.map((s: { description: string }, i: number) => (
                      <div key={i} className="mb-2 border-b pb-2">
                        <span className="font-medium">场景{i + 1}：</span>{s.description}
                      </div>
                    ))
                  }
                  return <div className="whitespace-pre-wrap">{report.shots}</div>
                } catch {
                  return <div className="whitespace-pre-wrap">{report.shots}</div>
                }
              })() : '分析中...'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-gray-900">AI 提示词</h3>
              {report?.prompt && (
                <button onClick={() => copyPrompt(report.prompt!)} className="text-sm text-blue-600 hover:text-blue-700">
                  复制
                </button>
              )}
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded">
              {report?.prompt || '生成中...'}
            </div>
            {/* 爆款复刻教程 */}
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-xs font-semibold text-blue-700 mb-2">🎬 爆款复刻教程</div>
              <div className="text-xs text-blue-600 space-y-1">
                <div>① 点击上方「复制」按钮，复制完整 Prompt</div>
                <div>② 打开 <span className="font-medium">即梦AI</span>（jimeng.jianying.com）或 <span className="font-medium">Sora</span>（sora.com）</div>
                <div>③ 在视频生成框中粘贴 Prompt，选择比例 9:16（竖屏 TikTok 格式）</div>
                <div>④ 选择画质和时长，点击生成即可获得风格类似的视频</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">脚本提取</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {report?.script || '提取中...'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
