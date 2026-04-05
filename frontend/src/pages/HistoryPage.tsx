import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { Video } from '../types'

export default function HistoryPage() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<Video[]>([])

  useEffect(() => {
    axios.get('/api/reports').then(res => setVideos(res.data))
  }, [])

  const deleteVideo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除？')) return
    await axios.delete(`/api/reports/${id}`)
    setVideos(v => v.filter(v => v.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">历史记录</h1>
          <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900">
            返回首页
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {videos.length === 0 ? (
          <div className="text-center text-gray-500 py-16">暂无分析记录</div>
        ) : (
          <div className="space-y-3">
            {videos.map(video => (
              <div
                key={video.id}
                onClick={() => navigate(`/analysis/${video.id}`)}
                className="bg-white rounded-lg shadow p-4 flex justify-between items-center cursor-pointer hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="font-medium text-gray-900">{video.filename}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(video.created_at).toLocaleString('zh-CN')}
                    <span className="ml-4">{video.status === 'completed' ? '✓ 已完成' : video.status}</span>
                  </div>
                </div>
                <button
                  onClick={e => deleteVideo(video.id, e)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
