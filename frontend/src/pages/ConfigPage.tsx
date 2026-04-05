import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

interface ModelConfig {
  id: string
  vision_model: string
  analysis_model: string
  updated_at: string
}

const MODEL_LABELS: Record<string, string> = {
  doubao:   '豆包 2.0',
  openai:   'OpenAI',
  claude:   'Claude',
  minimax:  'MiniMax',
  zhipu:    '智谱 GLM',
  deepseek: 'DeepSeek',
}

export default function ConfigPage() {
  const navigate = useNavigate()
  const [models, setModels] = useState<string[]>([])
  const [config, setConfig] = useState<ModelConfig | null>(null)
  const [visionModel, setVisionModel] = useState('')
  const [analysisModel, setAnalysisModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get('/api/config/models'),
      axios.get('/api/config/models/current'),
    ]).then(([modelsRes, configRes]) => {
      setModels(modelsRes.data.models)
      setConfig(configRes.data)
      setVisionModel(configRes.data.vision_model)
      setAnalysisModel(configRes.data.analysis_model)
    }).catch(() => setError('加载配置失败'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await axios.patch('/api/config/models', {
        vision_model: visionModel,
        analysis_model: analysisModel,
      })
      setConfig(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = config
    ? visionModel !== config.vision_model || analysisModel !== config.analysis_model
    : false

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">模型配置</h1>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/history')}
              className="text-gray-500 hover:text-gray-800 text-sm"
            >
              历史记录
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

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">AI 模型设置</h2>
          <p className="text-sm text-gray-500 mb-8">
            分别为视觉帧分析和综合内容分析选择 AI 模型。
          </p>

          {!config && !error && (
            <div className="text-center text-gray-400 py-8">加载中...</div>
          )}

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {config && (
            <>
              <div className="space-y-6">
                {/* Vision model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    视觉分析模型
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    用于分析视频关键帧（6帧图片），识别场景、人物、产品等视觉元素。
                  </p>
                  <select
                    value={visionModel}
                    onChange={e => setVisionModel(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {models.map(m => (
                      <option key={m} value={m}>
                        {MODEL_LABELS[m] ?? m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Analysis model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    综合分析模型
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    用于营销策略分析、分镜场景解析、AI 提示词生成和语音智能分段。
                  </p>
                  <select
                    value={analysisModel}
                    onChange={e => setAnalysisModel(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {models.map(m => (
                      <option key={m} value={m}>
                        {MODEL_LABELS[m] ?? m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {config.updated_at && (
                    <>上次更新：{new Date(config.updated_at).toLocaleString('zh-CN')}</>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    saved
                      ? 'bg-green-600 text-white'
                      : isDirty
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {saving ? '保存中...' : saved ? '已保存 ✓' : '保存配置'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Supported models info */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">支持的模型</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(MODEL_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <span>{label}</span>
                <span className="text-gray-400 text-xs">({key})</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">
            需在后端 <code className="bg-gray-100 px-1 rounded">.env</code> 文件中配置对应模型的 API Key 才能正常使用。
          </p>
        </div>
      </main>
    </div>
  )
}
