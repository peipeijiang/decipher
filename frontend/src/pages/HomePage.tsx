import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Upload, BarChart3, Film, Sparkles, FileText, Loader2 } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'

const SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'webm']
const MAX_SIZE = 500 * 1024 * 1024 // 500MB

const FEATURES = [
  { icon: BarChart3, title: '智能策略分析', desc: '拆解营销策略、内容结构、节奏设计', color: 'text-blue-500 bg-blue-50' },
  { icon: Film, title: '镜头逆向解析', desc: '逐帧还原拍摄手法和镜头语言', color: 'text-purple-500 bg-purple-50' },
  { icon: Sparkles, title: 'Prompt逆向工程', desc: '生成可用于 Sora/即梦 的英文提示词', color: 'text-amber-500 bg-amber-50' },
  { icon: FileText, title: '脚本智能提取', desc: '提取语音文稿并标记关键转折点', color: 'text-emerald-500 bg-emerald-50' },
]

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
    <MainLayout>
      <main className="max-w-3xl mx-auto px-6 pt-14 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            TikTok 爆款视频分析
          </h1>
          <p className="text-gray-500 text-sm">
            智能策略分析 · 镜头逆向解析 · Prompt逆向工程 · 脚本智能提取
          </p>
        </div>

        {/* Upload Area */}
        <label
          className={`block border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : uploading
              ? 'border-gray-200 bg-gray-50 cursor-default'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
          }`}
          onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { if (!uploading) handleDrop(e) }}
        >
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            {uploading ? (
              <>
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                <p className="text-sm font-medium text-gray-700 mb-3">上传中，请稍候…</p>
                <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                  <Upload className="w-7 h-7 text-blue-500" />
                </div>
                <p className="text-base font-semibold text-gray-800 mb-1">
                  拖拽视频到此处，或<span className="text-blue-500">点击上传</span>
                </p>
                <p className="text-xs text-gray-400">
                  支持 MP4、MOV、AVI、WebM，最大 500MB
                </p>
              </>
            )}
          </div>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
        </label>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${f.color}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-gray-800 mb-1">{f.title}</div>
              <div className="text-xs text-gray-500 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </MainLayout>
  )
}
