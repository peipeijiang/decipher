import { ChevronRight, ChevronLeft, Image as ImageIcon, Video, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import {
  cancelTask,
  triggerImageGeneration,
  triggerVideoGeneration,
  triggerBatchImageGeneration,
  triggerBatchVideoGeneration,
} from '../api/client'
import type { ProductPrompt } from '../types/product'

interface TaskQueueSidebarProps {
  prompts: ProductPrompt[]
  productId: string
  onUpdate: () => void
  open: boolean
  onToggle: () => void
}

type TaskStatus = 'pending' | 'queued' | 'generating' | 'completed' | 'failed'

function StatusDot({ status }: { status: TaskStatus }) {
  if (status === 'completed') {
    return <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
  }
  if (status === 'failed') {
    return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
  }
  if (status === 'generating') {
    return (
      <span className="relative flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
    )
  }
  if (status === 'queued') {
    return <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
  }
  return <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full bg-gray-300" />
}

function statusLabel(status: TaskStatus): string {
  if (status === 'completed') return '已完成'
  if (status === 'queued') return '排队中'
  if (status === 'generating') return '生成中'
  if (status === 'failed') return '失败'
  return '待生成'
}

export function TaskQueueSidebar({ prompts, productId, onUpdate, open, onToggle }: TaskQueueSidebarProps) {
  const imageStats = {
    generating: prompts.filter(p => p.image_status === 'generating').length,
    queued: prompts.filter(p => p.image_status === 'queued').length,
    completed: prompts.filter(p => p.image_status === 'completed').length,
    failed: prompts.filter(p => p.image_status === 'failed').length,
  }
  const videoStats = {
    generating: prompts.filter(p => p.video_status === 'generating').length,
    queued: prompts.filter(p => p.video_status === 'queued').length,
    completed: prompts.filter(p => p.video_status === 'completed').length,
    failed: prompts.filter(p => p.video_status === 'failed').length,
  }

  const handleBatchImage = async () => {
    try {
      await triggerBatchImageGeneration(productId)
      onUpdate()
    } catch (e: any) {
      alert('批量生成图片失败：' + (e.response?.data?.detail || e.message))
    }
  }

  const handleBatchVideo = async () => {
    try {
      await triggerBatchVideoGeneration(productId)
      onUpdate()
    } catch (e: any) {
      alert('批量生成视频失败：' + (e.response?.data?.detail || e.message))
    }
  }

  const handleCancelTask = async (promptId: string, type: 'image' | 'video') => {
    try {
      await cancelTask(promptId, type)
      onUpdate()
    } catch (e: any) {
      alert('取消失败：' + (e.response?.data?.detail || e.message))
    }
  }

  const handleRetryImage = async (promptId: string) => {
    try {
      await triggerImageGeneration(promptId)
      onUpdate()
    } catch (e: any) {
      alert('重试失败：' + (e.response?.data?.detail || e.message))
    }
  }

  const handleRetryVideo = async (promptId: string) => {
    try {
      await triggerVideoGeneration(promptId)
      onUpdate()
    } catch (e: any) {
      alert('重试失败：' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-6 h-16 bg-white border border-gray-200 border-r-0 rounded-l-lg shadow-md hover:bg-gray-50 transition-colors"
        aria-label={open ? '收起任务队列' : '展开任务队列'}
      >
        {open ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" /> : <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />}
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed right-0 top-0 h-full w-80 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">任务队列</h2>
          <button
            onClick={onToggle}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="收起"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Batch actions */}
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
          <button
            onClick={handleBatchImage}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            全部生成图片
          </button>
          <button
            onClick={handleBatchVideo}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <Video className="w-3.5 h-3.5" />
            全部生成视频
          </button>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> 图片
            </div>
            <div className="flex gap-2 text-[10px]">
              {imageStats.generating > 0 && (
                <span className="flex items-center gap-0.5 text-blue-600">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />{imageStats.generating}
                </span>
              )}
              {imageStats.queued > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600">
                  <Clock className="w-2.5 h-2.5" />{imageStats.queued}
                </span>
              )}
              {imageStats.completed > 0 && (
                <span className="flex items-center gap-0.5 text-green-600">
                  <CheckCircle className="w-2.5 h-2.5" />{imageStats.completed}
                </span>
              )}
              {imageStats.failed > 0 && (
                <span className="flex items-center gap-0.5 text-red-600">
                  <XCircle className="w-2.5 h-2.5" />{imageStats.failed}
                </span>
              )}
              {imageStats.generating === 0 && imageStats.queued === 0 && imageStats.completed === 0 && imageStats.failed === 0 && (
                <span className="flex items-center gap-0.5 text-gray-400">
                  <Clock className="w-2.5 h-2.5" />待生成
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
              <Video className="w-3 h-3" /> 视频
            </div>
            <div className="flex gap-2 text-[10px]">
              {videoStats.generating > 0 && (
                <span className="flex items-center gap-0.5 text-blue-600">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />{videoStats.generating}
                </span>
              )}
              {videoStats.queued > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600">
                  <Clock className="w-2.5 h-2.5" />{videoStats.queued}
                </span>
              )}
              {videoStats.completed > 0 && (
                <span className="flex items-center gap-0.5 text-green-600">
                  <CheckCircle className="w-2.5 h-2.5" />{videoStats.completed}
                </span>
              )}
              {videoStats.failed > 0 && (
                <span className="flex items-center gap-0.5 text-red-600">
                  <XCircle className="w-2.5 h-2.5" />{videoStats.failed}
                </span>
              )}
              {videoStats.generating === 0 && videoStats.queued === 0 && videoStats.completed === 0 && videoStats.failed === 0 && (
                <span className="flex items-center gap-0.5 text-gray-400">
                  <Clock className="w-2.5 h-2.5" />待生成
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {prompts.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">暂无任务</p>
          )}
          {prompts.map(prompt => (
            <div key={prompt.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="text-[10px] font-semibold text-gray-600 mb-2">
                变体 {prompt.variant_index} · {prompt.template_name}
              </div>

              {/* Image row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <StatusDot status={prompt.image_status} />
                  <ImageIcon className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] text-gray-600">{statusLabel(prompt.image_status)}</span>
                </div>
                <div className="flex gap-1">
                  {(prompt.image_status === 'queued' || prompt.image_status === 'generating') && (
                    <button
                      onClick={() => handleCancelTask(prompt.id, 'image')}
                      className="text-[10px] text-gray-500 hover:text-red-500 px-1.5 py-0.5 rounded border border-gray-200 hover:border-red-200 transition-colors"
                    >
                      取消
                    </button>
                  )}
                  {prompt.image_status === 'failed' && (
                    <button
                      onClick={() => handleRetryImage(prompt.id)}
                      className="text-[10px] text-blue-500 hover:text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>

              {/* Video row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <StatusDot status={prompt.video_status} />
                  <Video className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] text-gray-600">{statusLabel(prompt.video_status)}</span>
                </div>
                <div className="flex gap-1">
                  {(prompt.video_status === 'queued' || prompt.video_status === 'generating') && (
                    <button
                      onClick={() => handleCancelTask(prompt.id, 'video')}
                      className="text-[10px] text-gray-500 hover:text-red-500 px-1.5 py-0.5 rounded border border-gray-200 hover:border-red-200 transition-colors"
                    >
                      取消
                    </button>
                  )}
                  {prompt.video_status === 'failed' && (
                    <button
                      onClick={() => handleRetryVideo(prompt.id)}
                      className="text-[10px] text-blue-500 hover:text-blue-600 px-1.5 py-0.5 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
