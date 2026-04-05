import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'webm']
const MAX_SIZE = 500 * 1024 * 1024 // 500MB

export default function HomePage() {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleUpload = async (file: File) => {
    setError('')
    
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!SUPPORTED_FORMATS.includes(ext)) {
      setError(`不支持的格式，仅支持：${SUPPORTED_FORMATS.join(', ')}`)
      return
    }
    if (file.size > MAX_SIZE) {
      setError('文件超过500MB限制')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post('/api/videos/upload', formData)
      navigate(`/analysis/${res.data.id}`)
    } catch (e: any) {
      setError(e.response?.data?.detail || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">ViralLens</h1>
          <button onClick={() => navigate('/history')} className="text-gray-600 hover:text-gray-900">
            历史记录
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">
          TikTok 爆款视频分析系统
        </h2>
        <p className="text-lg text-gray-600 mb-12">
          智能策略分析 · 镜头逆向解析 · Prompt逆向工程 · 脚本智能提取
        </p>

        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-2xl p-16 transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="text-blue-600">上传中...</div>
          ) : (
            <>
              <div className="text-5xl mb-4">📤</div>
              <div className="text-lg text-gray-700 mb-2">
                拖拽视频文件到此处，或{' '}
                <label className="text-blue-600 hover:text-blue-700 cursor-pointer">
                  点击上传
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file)
                    }}
                  />
                </label>
              </div>
              <div className="text-sm text-gray-500">
                支持 MP4, MOV, AVI, WebM，最大 500MB
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 text-red-600">{error}</div>
        )}
      </main>
    </div>
  )
}
