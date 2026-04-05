import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Film, Sparkles, Clock, Trash2, ChevronRight, PanelRightOpen, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import axios from 'axios'

interface VideoItem {
  video_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  duration?: number
  platform?: string
}

interface CreativeItem {
  id: string
  description: string
  created_at: string
  results: any[]
  video_id: string | null
}

type Tab = 'video' | 'creative'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const statusMap: Record<string, { label: string; icon: any; cls: string }> = {
  completed: { label: '完成', icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200' },
  processing: { label: '分析中', icon: Loader2, cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  pending: { label: '排队中', icon: Clock, cls: 'text-gray-600 bg-gray-50 border-gray-200' },
  failed: { label: '失败', icon: AlertCircle, cls: 'text-red-600 bg-red-50 border-red-200' },
}

export function HistorySidebar() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('video')
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [creatives, setCreatives] = useState<CreativeItem[]>([])
  const [linkedCreatives, setLinkedCreatives] = useState<CreativeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [reanalyzing, setReanalyzing] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [vRes, cRes, lcRes] = await Promise.all([
        axios.get('/api/reports'),
        axios.get('/api/creative/history?standalone=true'),
        axios.get('/api/creative/history'),
      ])
      setVideos(vRes.data)
      setCreatives(cRes.data)
      setLinkedCreatives(lcRes.data.filter((c: CreativeItem) => c.video_id))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const deleteVideo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await axios.delete(`/api/reports/${id}`)
    setVideos(prev => prev.filter(v => v.video_id !== id))
  }

  const retryVideo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setReanalyzing(prev => new Set(prev).add(id))
    try {
      await axios.post(`/api/videos/${id}/analyze`)
      setVideos(prev => prev.map(v => v.video_id === id ? { ...v, status: 'processing' } : v))
    } finally {
      setReanalyzing(prev => {
        const s = new Set(prev)
        s.delete(id)
        return s
      })
    }
  }

  const deleteCreative = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await axios.delete(`/api/creative/history/${id}`)
    setCreatives(prev => prev.filter(c => c.id !== id))
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed right-5 top-5 z-50 group"
        title="历史记录"
      >
        <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center text-white transition-all group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-blue-500/30">
          <PanelRightOpen className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
        </div>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`fixed right-0 top-0 h-screen w-96 bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">历史记录中心</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab('video')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
              tab === 'video' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            视频分析
            {videos.length > 0 && (
              <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{videos.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('creative')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
              tab === 'creative' ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50/50' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            创意Prompt
            {creatives.length > 0 && (
              <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{creatives.length}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : tab === 'video' ? (
            videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <Film className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">暂无视频分析记录</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {videos.map(v => {
                  const st = statusMap[v.status] || statusMap.pending
                  const StatusIcon = st.icon
                  const isRetrying = reanalyzing.has(v.video_id)
                  return (
                    <button
                      key={v.video_id}
                      onClick={() => { navigate(`/analysis/${v.video_id}`); setOpen(false) }}
                      className="w-full rounded-xl border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-gray-800 truncate">{v.filename}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{formatTime(v.created_at)} · {timeAgo(v.created_at)}</div>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${st.cls}`}>
                          <StatusIcon className={`w-3 h-3 ${v.status === 'processing' ? 'animate-spin' : ''}`} />
                          {st.label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                          <span>
                            {v.duration ? `时长 ${Math.round(v.duration)}s` : '时长未知'}
                            {v.platform ? ` · ${v.platform}` : ''}
                          </span>
                          {(() => {
                            const cnt = linkedCreatives.filter(c => c.video_id === v.video_id).length
                            return cnt > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                                <Sparkles className="w-2.5 h-2.5" />
                                {cnt}个创意
                              </span>
                            ) : null
                          })()}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {v.status === 'failed' && (
                            <button
                              onClick={e => retryVideo(v.video_id, e)}
                              disabled={isRetrying}
                              className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
                              title="重新分析"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={e => deleteVideo(v.video_id, e)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            creatives.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <Sparkles className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">暂无创意Prompt记录</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {creatives.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { navigate('/creative', { state: { restore: c } }); setOpen(false) }}
                    className="w-full rounded-xl border border-gray-200 p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-all text-left group"
                  >
                    <div className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1">{c.description}</div>
                    <div className="text-[10px] text-gray-400 mb-2">{formatTime(c.created_at)} · {timeAgo(c.created_at)}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded-full inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {c.results.length} 个角度
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => deleteCreative(c.id, e)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}
