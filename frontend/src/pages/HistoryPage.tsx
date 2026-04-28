import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Film, Clock, Timer, Trash2, Inbox, RefreshCw } from 'lucide-react'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ListSkeleton } from '../components/ui/LoadingSkeleton'
import { MainLayout } from '../components/layout/MainLayout'

interface HistoryItem {
  video_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  duration?: number
  platform?: string
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState<Set<string>>(new Set())

  useEffect(() => {
    axios.get('/api/reports')
      .then(res => setItems(res.data))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除该记录？此操作不可撤销。')) return
    await axios.delete(`/api/reports/${videoId}`)
    setItems(prev => prev.filter(item => item.video_id !== videoId))
  }

  const handleReanalyze = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setReanalyzing(prev => new Set(prev).add(videoId))
    try {
      await axios.post(`/api/videos/${videoId}/analyze`)
      setItems(prev => prev.map(item =>
        item.video_id === videoId ? { ...item, status: 'processing' } : item
      ))
      navigate(`/analysis/${videoId}`)
    } catch {
      setReanalyzing(prev => { const s = new Set(prev); s.delete(videoId); return s })
    }
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-6 pt-10 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">历史记录</h1>
          {!loading && items.length > 0 && (
            <span className="text-sm text-gray-400">{items.length} 条记录</span>
          )}
        </div>

        {loading ? (
          <ListSkeleton count={5} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">暂无分析记录</h3>
            <p className="text-sm text-gray-400 mb-6">还没有分析过任何视频，上传第一个视频开始体验吧！</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors cursor-pointer"
            >
              上传第一个视频
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.video_id}
                onClick={() => navigate(`/analysis/${item.video_id}`)}
                className="group bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex justify-between items-center hover:border-blue-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Film className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.filename}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString('zh-CN')}
                      </span>
                      {item.duration && (
                        <span className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          {Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <StatusBadge status={item.status} />
                  {(item.status === 'failed' || item.status === 'pending') && (
                    <button
                      onClick={e => handleReanalyze(item.video_id, e)}
                      disabled={reanalyzing.has(item.video_id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${reanalyzing.has(item.video_id) ? 'animate-spin' : ''}`} />
                      重新分析
                    </button>
                  )}
                  <button
                    onClick={e => handleDelete(item.video_id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150 cursor-pointer"
                    aria-label="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
