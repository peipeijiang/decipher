import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { Video, Report, Progress } from '../types'

const STEPS = ['视频上传', '智能解析', '策略拆解', '提示词生成']

export default function AnalysisPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const [video, setVideo] = useState<Video | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [progress, setProgress] = useState<Progress>({ upload: 0, parse: 0, strategy: 0, prompt: 0 })
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const fetchData = async () => {
    if (!videoId) return
    try {
      const res = await axios.get(`/api/videos/${videoId}`)
      setVideo(res.data.video)
      setProgress(res.data.progress || progress)
      if (res.data.report) {
        setReport(res.data.report)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [videoId])

  const saveNotes = async () => {
    if (!videoId) return
    setSavingNotes(true)
    try {
      await axios.patch(`/api/reports/${videoId}`, { notes })
    } catch (e) {
      console.error(e)
    } finally {
      setSavingNotes(false)
    }
  }

  const copyPrompt = () => {
    if (report?.prompt) navigator.clipboard.writeText(report.prompt)
  }

  const getStepStatus = (idx: number) => {
    const values = [progress.upload, progress.parse, progress.strategy, progress.prompt]
    if (values[idx] >= 100) return 'completed'
    if (values[idx] > 0) return 'active'
    if (idx === 0 && video) return 'active'
    return 'pending'
  }

  if (!video) return <div className="p-8 text-center">加载中...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Bar */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
        {/* Left: Video Player */}
        <div>
          <video
            src={`/api/videos/${videoId}/stream`}
            controls
            className="w-full rounded-lg shadow"
          />
          <div className="mt-4 bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">视频信息</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div>时长：{video.duration ? `${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')}` : '-'}</div>
              <div>平台：{video.platform || 'TikTok'}</div>
              <div>点赞：{video.likes || '-'}</div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">备注</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
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
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">智能策略分析</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {report?.strategy || '分析中...'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-2">分镜场景分析</h3>
            <div className="text-sm text-gray-700">
              {report?.shots ? JSON.parse(report.shots).map((s: any, i: number) => (
                <div key={i} className="mb-2 border-b pb-2">
                  <span className="font-medium">场景{i + 1}：</span>{s.description}
                </div>
              )) : '分析中...'}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-gray-900">AI 提示词</h3>
              {report?.prompt && (
                <button onClick={copyPrompt} className="text-sm text-blue-600 hover:text-blue-700">
                  复制
                </button>
              )}
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded">
              {report?.prompt || '生成中...'}
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
