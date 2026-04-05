import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// Provider definitions
const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    label: 'OpenAI GPT-4o',
    description: '视觉分析 + 综合分析',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    keyField: 'openai_api_key',
    endpointField: 'openai_endpoint',
    configuredField: 'openai_configured',
    defaultEndpoint: 'https://api.openai.com/v1',
    icon: '🤖',
  },
  {
    id: 'claude',
    name: 'Claude',
    label: 'Claude 3.5 Sonnet',
    description: '视觉分析 + 综合分析',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    keyField: 'claude_api_key',
    endpointField: 'claude_endpoint',
    configuredField: 'claude_configured',
    defaultEndpoint: 'https://api.anthropic.com',
    icon: '🧠',
  },
  {
    id: 'doubao',
    name: '豆包',
    label: '豆包 2.0',
    description: '视觉分析 + 综合分析',
    apiKeyUrl: 'https://console.volcengine.com/ark',
    keyField: 'doubao_api_key',
    endpointField: 'doubao_endpoint',
    configuredField: 'doubao_configured',
    defaultEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    icon: '🔥',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    label: 'MiniMax Text-01',
    description: '综合分析',
    apiKeyUrl: 'https://platform.minimaxi.com/',
    keyField: 'minimax_api_key',
    endpointField: 'minimax_endpoint',
    configuredField: 'minimax_configured',
    defaultEndpoint: 'https://api.minimax.chat/v1',
    icon: '📊',
  },
  {
    id: 'zhipu',
    name: '智谱',
    label: 'GLM-4V-Plus',
    description: '视觉分析 + 综合分析',
    apiKeyUrl: 'https://open.bigmodel.cn/dev/api',
    keyField: 'zhipu_api_key',
    endpointField: 'zhipu_endpoint',
    configuredField: 'zhipu_configured',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    icon: '💎',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    label: 'DeepSeek Chat',
    description: '综合分析（不支持视觉）',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    keyField: 'deepseek_api_key',
    endpointField: 'deepseek_endpoint',
    configuredField: 'deepseek_configured',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    icon: '🔮',
  },
] as const

interface Config {
  id: string
  vision_model: string
  analysis_model: string
  openai_configured: boolean
  claude_configured: boolean
  doubao_configured: boolean
  minimax_configured: boolean
  zhipu_configured: boolean
  deepseek_configured: boolean
  openai_endpoint: string | null
  claude_endpoint: string | null
  doubao_endpoint: string | null
  minimax_endpoint: string | null
  zhipu_endpoint: string | null
  deepseek_endpoint: string | null
  temperature: number
  max_tokens: number
  updated_at: string
}

export default function ConfigPage() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<Config | null>(null)
  const [visionModel, setVisionModel] = useState('openai')
  const [analysisModel, setAnalysisModel] = useState('openai')
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    Promise.all([
      axios.get('/api/config/models/current'),
    ]).then(([configRes]) => {
      const c: Config = configRes.data
      setConfig(c)
      setVisionModel(c.vision_model)
      setAnalysisModel(c.analysis_model)
      setTemperature(c.temperature)
      setMaxTokens(c.max_tokens)
      // Initialize empty API keys (user needs to fill them)
      setApiKeys({})
      setEndpoints({
        openai: c.openai_endpoint || PROVIDERS[0].defaultEndpoint,
        claude: c.claude_endpoint || PROVIDERS[1].defaultEndpoint,
        doubao: c.doubao_endpoint || PROVIDERS[2].defaultEndpoint,
        minimax: c.minimax_endpoint || PROVIDERS[3].defaultEndpoint,
        zhipu: c.zhipu_endpoint || PROVIDERS[4].defaultEndpoint,
        deepseek: c.deepseek_endpoint || PROVIDERS[5].defaultEndpoint,
      })
    }).catch(() => setError('加载配置失败'))
  }, [])

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const payload: Record<string, unknown> = {
        vision_model: visionModel,
        analysis_model: analysisModel,
        temperature,
        max_tokens: maxTokens,
      }
      // Only include API keys that have values
      for (const p of PROVIDERS) {
        if (apiKeys[p.keyField as keyof typeof apiKeys]) {
          (payload as any)[p.keyField] = apiKeys[p.keyField as keyof typeof apiKeys]
        }
        if (endpoints[p.id] !== PROVIDERS.find(pr => pr.id === p.id)?.defaultEndpoint) {
          (payload as any)[p.endpointField] = endpoints[p.id] || null
        }
      }
      const res = await axios.patch('/api/config/models', payload)
      setConfig(res.data)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const isConfigured = (providerId: string) => {
    const field = PROVIDERS.find(p => p.id === providerId)?.configuredField as keyof Config
    return config?.[field] as boolean
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">⚙️ 模型配置</h1>
          <div className="flex gap-4 text-sm">
            <button onClick={() => navigate('/history')} className="text-gray-500 hover:text-gray-800">历史记录</button>
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900 font-medium">返回首页</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Global Parameters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">全局参数</h2>
          <p className="text-sm text-gray-500 mb-6">所有模型共享的参数配置</p>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Temperature</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={e => { setTemperature(parseFloat(e.target.value)); markDirty() }}
                  className="flex-1"
                />
                <span className="text-sm text-gray-600 w-10">{temperature}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">控制随机性，越低越确定</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={e => { setMaxTokens(parseInt(e.target.value) || 4096); markDirty() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="100"
                max="128000"
              />
              <p className="text-xs text-gray-400 mt-1">单次响应最大token数</p>
            </div>
          </div>
        </div>

        {/* Model Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">模型选择</h2>
          <p className="text-sm text-gray-500 mb-6">分别选择视觉分析模型和综合分析模型</p>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                🔍 视觉分析模型
              </label>
              <p className="text-xs text-gray-400 mb-2">用于分析视频关键帧（6帧图片）</p>
              <select
                value={visionModel}
                onChange={e => { setVisionModel(e.target.value); markDirty() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                {PROVIDERS.filter(p => p.description.includes('视觉')).map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                🧠 综合分析模型
              </label>
              <p className="text-xs text-gray-400 mb-2">策略分析、分镜解析、Prompt生成、语音分段</p>
              <select
                value={analysisModel}
                onChange={e => { setAnalysisModel(e.target.value); markDirty() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Provider API Keys */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">API Key 配置</h2>
          <p className="text-sm text-gray-500 mb-6">填写你需要使用的模型的 API Key，已配置的会显示 ✓</p>

          <div className="space-y-6">
            {PROVIDERS.map(provider => {
              const hasKey = isConfigured(provider.id)
              return (
                <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{provider.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {provider.label}
                          {hasKey && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ 已配置</span>}
                        </div>
                        <div className="text-xs text-gray-500">{provider.description}</div>
                      </div>
                    </div>
                    <a
                      href={provider.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      获取API Key →
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        API Key {hasKey && <span className="text-green-600">(已保存)</span>}
                      </label>
                      <input
                        type="password"
                        placeholder={hasKey ? '••••••••••••••••' : `sk-... 或 apikey-...`}
                        value={apiKeys[provider.keyField] || ''}
                        onChange={e => {
                          setApiKeys(prev => ({ ...prev, [provider.keyField]: e.target.value }))
                          markDirty()
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Endpoint</label>
                      <input
                        type="url"
                        value={endpoints[provider.id] || ''}
                        onChange={e => {
                          setEndpoints(prev => ({ ...prev, [provider.id]: e.target.value }))
                          markDirty()
                        }}
                        placeholder={provider.defaultEndpoint}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Error / Save */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {config?.updated_at && <>最后更新：{new Date(config.updated_at).toLocaleString('zh-CN')}</>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`px-8 py-3 rounded-xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-green-600 text-white'
                : dirty
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </main>
    </div>
  )
}
