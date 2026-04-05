import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

interface HistoryItem {
  video_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  duration?: number
  platform?: string
}

const STATUS_BADGE: Record<HistoryItem['status'], { label: string; cls: string }> = {
  pending:    { label: '等待中', cls: 'bg-gray-100 text-gray-600' },
  processing: { label: '分析中', cls: 'bg-blue-100 text-blue-700' },
  completed:  { label: '已完成', cls: 'bg-green-100 text-green-700' },
  failed:     { label: '失败',   cls: 'bg-red-100 text-red-700' },
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">历史记录</h1>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/config')}
              className="text-gray-500 hover:text-gray-800 text-sm"
            >
              模型配置
            </button>
            <button
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
            >
              返回首页
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-16">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <div className="text-4xl mb-4">📭</div>
            <div>暂无分析记录</div>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              上传第一个视频
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-gray-500 mb-4">共 {items.length} 条记录</div>
            {items.map(item => {
              const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.pending
              return (
                <div
                  key={item.video_id}
                  onClick={() => navigate(`/analysis/${item.video_id}`)}
                  className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex justify-between items-center cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="text-2xl flex-shrink-0">🎬</div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{item.filename}</div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {new Date(item.created_at).toLocaleString('zh-CN')}
                        {item.duration && (
                          <span className="ml-3">
                            {Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <button
                      onClick={e => handleDelete(item.video_id, e)}
                      className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
