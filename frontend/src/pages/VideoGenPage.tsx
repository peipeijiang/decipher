import { useState, useEffect, useRef, useCallback } from 'react'
import { Video, Upload, Send, RefreshCw, Trash2, Edit3, Download, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { createVideoGen, getVideoGenList, retryVideoGen, deleteVideoGen, uploadVideoGenRef } from '../api/client'
import type { VideoGeneration } from '../types/videoGen'

const MODELS = [
  { value: 'seedance-2.0', label: 'Seedance 2.0' },
  { value: 'veo-3.1', label: 'Veo 3.1' },
  { value: 'happyhorse-1.0', label: 'HappyHorse 1.0' },
  { value: 'wan-2.6', label: 'Wan 2.6' },
]

const ASPECT_RATIOS = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
]

const DURATIONS: Record<string, number[]> = {
  'seedance-2.0': [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'veo-3.1': [5, 6, 7, 8],
  'happyhorse-1.0': [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'wan-2.6': [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
}

export default function VideoGenPage() {
  const [items, setItems] = useState<VideoGeneration[]>([])
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('seedance-2.0')
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [duration, setDuration] = useState(5)
  const [refImage, setRefImage] = useState<string | null>(null)
  const [refPreview, setRefPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // PLACEHOLDER_FETCH

  const fetchList = useCallback(async () => {
    try {
      const data = await getVideoGenList({ limit: 100 })
      setItems(data.items)
    } catch (e) {
      console.error('Failed to fetch video gen list', e)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // Poll while any item is generating
  useEffect(() => {
    const hasGenerating = items.some(i => i.status === 'generating' || i.status === 'pending')
    if (hasGenerating && !pollRef.current) {
      pollRef.current = setInterval(fetchList, 2000)
    } else if (!hasGenerating && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [items, fetchList])

  // Auto-scroll to bottom on new items
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [items.length])

  // Reset duration when model changes
  useEffect(() => {
    const available = DURATIONS[model] || [5]
    if (!available.includes(duration)) {
      setDuration(available[0])
    }
  }, [model, duration])

  const handleUploadRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadVideoGenRef(file)
      setRefImage(result.path)
      setRefPreview(URL.createObjectURL(file))
    } catch (err: any) {
      alert('上传失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
    }
  }

  const handleSend = async () => {
    if (!prompt.trim() || sending) return
    const currentPrompt = prompt.trim()
    const currentRef = refImage
    const currentModel = model
    const currentRatio = aspectRatio
    const currentDuration = duration

    // Immediately clear input for next message
    setPrompt('')
    setRefImage(null)
    setRefPreview(null)

    try {
      const gen = await createVideoGen({
        prompt: currentPrompt,
        reference_image: currentRef || undefined,
        model: currentModel,
        aspect_ratio: currentRatio,
        duration: currentDuration,
      })
      // Add to list optimistically
      setItems(prev => [gen, ...prev])
    } catch (err: any) {
      alert('提交失败: ' + (err.response?.data?.detail || err.message))
      // Restore input on failure
      setPrompt(currentPrompt)
      setRefImage(currentRef)
    }
  }

  const handleRetry = async (id: string) => {
    await retryVideoGen(id)
    fetchList()
  }

  const handleDelete = async (id: string) => {
    await deleteVideoGen(id)
    fetchList()
  }

  const handleReEdit = (item: VideoGeneration) => {
    setPrompt(item.prompt)
    setModel(item.model)
    setAspectRatio(item.aspect_ratio)
    setDuration(item.duration)
  }

  // PLACEHOLDER_RENDER

  const reversedItems = [...items].reverse()

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto">
        {/* History area */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {reversedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Video className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">输入提示词开始生成视频</p>
            </div>
          )}
          {reversedItems.map(item => (
            <VideoGenCard
              key={item.id}
              item={item}
              onRetry={() => handleRetry(item.id)}
              onDelete={() => handleDelete(item.id)}
              onReEdit={() => handleReEdit(item)}
            />
          ))}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-100 bg-white px-4 py-3">
          <div className="max-w-4xl mx-auto bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
            {/* Top: reference + textarea */}
            <div className="flex items-start gap-3 p-3">
              {/* Reference image upload */}
              <div className="flex-shrink-0">
                {refPreview ? (
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                    <img src={refPreview} alt="ref" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setRefImage(null); setRefPreview(null) }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span className="text-[9px] mt-0.5">参考图</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadRef} />
              </div>

              {/* Textarea */}
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="输入视频提示词..."
                rows={6}
                className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none py-1"
              />
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-center gap-2 px-3 pb-3">
              {/* Model selector */}
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 outline-none"
              >
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>

              {/* Aspect ratio */}
              <select
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value)}
                className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 outline-none"
              >
                {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>

              {/* Duration */}
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 outline-none"
              >
                {(DURATIONS[model] || [5]).map(d => <option key={d} value={d}>{d}s</option>)}
              </select>

              <div className="flex-1" />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!prompt.trim() || sending}
                className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

// PLACEHOLDER_CARD

function VideoGenCard({ item, onRetry, onDelete, onReEdit }: {
  item: VideoGeneration
  onRetry: () => void
  onDelete: () => void
  onReEdit: () => void
}) {
  const modelLabel = MODELS.find(m => m.value === item.model)?.label || item.model
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
  const [expanded, setExpanded] = useState(false)
  const isLong = item.prompt.length > 100

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      {/* Header: ref image + prompt + metadata */}
      <div className="flex items-start gap-3 mb-3">
        {/* Reference image thumbnail */}
        {item.reference_image && (
          <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-200">
            <img
              src={`${API_BASE}/api/video-gen/ref-image/${encodeURIComponent(item.reference_image)}`}
              alt="ref"
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
        {/* Prompt text - collapsible */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-800 whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
            {item.prompt}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-[11px] text-blue-500 hover:text-blue-600 mt-1"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {expanded ? '收起' : '展开'}
            </button>
          )}
        </div>
        {/* Metadata */}
        <div className="flex-shrink-0 text-[10px] text-gray-400 text-right whitespace-nowrap">
          <div>{modelLabel}</div>
          <div>{item.duration}s | {item.aspect_ratio}</div>
        </div>
      </div>

      {/* Video / Status */}
      {item.status === 'completed' && item.video_url && (
        <div className="mb-3 rounded-lg overflow-hidden bg-black">
          <video
            src={`${API_BASE}/api/video-gen/${item.id}/video`}
            controls
            className="w-full max-h-80 object-contain"
          />
        </div>
      )}

      {item.status === 'generating' && (
        <div className="mb-3 flex items-center gap-2 py-6 justify-center bg-gray-50 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm text-gray-500">视频生成中...</span>
        </div>
      )}

      {item.status === 'pending' && (
        <div className="mb-3 flex items-center gap-2 py-6 justify-center bg-gray-50 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-400">排队中...</span>
        </div>
      )}

      {item.status === 'failed' && (
        <div className="mb-3 py-4 px-3 bg-red-50 rounded-lg">
          <p className="text-xs text-red-600">{item.error_message || '生成失败'}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReEdit}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Edit3 className="w-3 h-3" /> 重新编辑
        </button>
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> 再次生成
        </button>
        {item.status === 'completed' && item.video_url && (
          <a
            href={`${API_BASE}/api/video-gen/${item.id}/video`}
            download
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-500 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3 h-3" /> 下载
          </a>
        )}
        <div className="flex-1" />
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
        <span className="text-[10px] text-gray-300">
          {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : ''}
        </span>
      </div>
    </div>
  )
}
