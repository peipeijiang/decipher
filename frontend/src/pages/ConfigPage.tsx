import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { MainLayout } from '../components/layout/MainLayout'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderStatus {
  configured: boolean
  endpoint: string
  vision_model: string
  text_model: string
}

interface CurrentConfig {
  id: string
  vision_model: string
  analysis_model: string
  image_model: string
  video_model: string
  providers: Record<string, ProviderStatus>
  temperature: number
  max_tokens: number
  laozhang_api_key_configured: boolean
  volcengine_api_key_configured: boolean
  aliyun_api_key_configured: boolean
  updated_at: string
}

interface ProviderPreset {
  id: string
  name: string
  endpoint: string
  vision_model: string
  text_model: string
  supports_vision: boolean
  icon: string
  api_key_url: string
}

interface ProviderFields {
  api_key: string
  endpoint: string
  vision_model: string
  text_model: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [config, setConfig] = useState<CurrentConfig | null>(null)
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [visionModel, setVisionModel] = useState('openai')
  const [analysisModel, setAnalysisModel] = useState('openai')
  const [imageModel, setImageModel] = useState('laozhang-image-2-vip')
  const [videoModel, setVideoModel] = useState('seedance-2.0')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [providerFields, setProviderFields] = useState<Record<string, ProviderFields>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [laozhangApiKey, setLaozhangApiKey] = useState('')
  const [volcengineApiKey, setVolcengineApiKey] = useState('')
  const [aliyunApiKey, setAliyunApiKey] = useState('')

  useEffect(() => {
    Promise.all([
      axios.get<CurrentConfig>('/api/config/models/current'),
      axios.get<ProviderPreset[]>('/api/config/providers'),
    ]).then(([configRes, presetsRes]) => {
      const c = configRes.data
      const ps = presetsRes.data
      setConfig(c)
      setPresets(ps)
      setVisionModel(c.vision_model)
      setAnalysisModel(c.analysis_model)
      setImageModel(c.image_model)
      setVideoModel(c.video_model)
      setTemperature(c.temperature)
      setMaxTokens(c.max_tokens)

      const fields: Record<string, ProviderFields> = {}
      for (const p of ps) {
        const cur = c.providers[p.id] ?? {}
        fields[p.id] = {
          api_key: '',
          endpoint: cur.endpoint || p.endpoint,
          vision_model: cur.vision_model || p.vision_model,
          text_model: cur.text_model || p.text_model,
        }
      }
      setProviderFields(fields)
    }).catch(() => setError('加载配置失败'))
  }, [])

  const mark = useCallback(() => setDirty(true), [])

  const setField = (pid: string, key: keyof ProviderFields, value: string) => {
    setProviderFields(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: value } }))
    mark()
  }

  const resetProvider = (preset: ProviderPreset) => {
    setProviderFields(prev => ({
      ...prev,
      [preset.id]: {
        api_key: '',
        endpoint: preset.endpoint,
        vision_model: preset.vision_model,
        text_model: preset.text_model,
      },
    }))
    mark()
  }

  const toggleExpand = (pid: string) =>
    setExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const providers: Record<string, Partial<ProviderFields>> = {}
      for (const [pid, f] of Object.entries(providerFields)) {
        const preset = presets.find(p => p.id === pid)
        providers[pid] = {
          endpoint: f.endpoint,
          vision_model: f.vision_model,
          text_model: f.text_model,
          // Only send api_key when user typed something
          ...(f.api_key ? { api_key: f.api_key } : {}),
        }
        // Omit fields that match the preset to keep payload clean,
        // but always send endpoint/models so user overrides are saved
        void preset
      }
      const res = await axios.patch<CurrentConfig>('/api/config/models', {
        vision_model: visionModel,
        analysis_model: analysisModel,
        image_model: imageModel,
        video_model: videoModel,
        temperature,
        max_tokens: maxTokens,
        providers,
        // Only send generation-model keys when user typed something
        ...(laozhangApiKey ? { laozhang_api_key: laozhangApiKey } : {}),
        ...(volcengineApiKey ? { volcengine_api_key: volcengineApiKey } : {}),
        ...(aliyunApiKey ? { aliyun_api_key: aliyunApiKey } : {}),
      })
      setConfig(res.data)
      setImageModel(res.data.image_model)
      setVideoModel(res.data.video_model)
      setDirty(false)
      setSaved(true)
      // Clear api_key inputs after successful save
      setProviderFields(prev => {
        const next = { ...prev }
        for (const pid of Object.keys(next)) {
          next[pid] = { ...next[pid], api_key: '' }
        }
        return next
      })
      setLaozhangApiKey('')
      setVolcengineApiKey('')
      setAliyunApiKey('')
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const visionProviders = presets.filter(p => p.supports_vision)
  const isConfigured = (pid: string) => config?.providers[pid]?.configured ?? false

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">
        <h1 className="text-3xl font-bold font-heading mb-8">模型配置</h1>

        <div className="space-y-6">

        {/* Global Parameters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">全局参数</h2>
          <p className="text-sm text-gray-500 mb-6">所有模型共享的参数配置</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Temperature</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={temperature}
                  onChange={e => { setTemperature(parseFloat(e.target.value)); mark() }}
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
                onChange={e => { setMaxTokens(parseInt(e.target.value) || 4096); mark() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="100" max="128000"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">🔍 视觉分析模型</label>
              <p className="text-xs text-gray-400 mb-2">用于分析视频关键帧（6帧图片）</p>
              <select
                value={visionModel}
                onChange={e => { setVisionModel(e.target.value); mark() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                {visionProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">🧠 综合分析模型</label>
              <p className="text-xs text-gray-400 mb-2">策略分析、分镜解析、Prompt生成、语音分段</p>
              <select
                value={analysisModel}
                onChange={e => { setAnalysisModel(e.target.value); mark() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Image & Video Generation Models */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">生成模型配置</h2>
          <p className="text-sm text-gray-500 mb-6">选择图片生成和视频生成模型，在下方配置对应 API Key</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">🎨 图片生成模型</label>
              <p className="text-xs text-gray-400 mb-2">用于生成营销图片</p>
              <select
                value={imageModel}
                onChange={e => { setImageModel(e.target.value); mark() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="laozhang-image-2-vip">🖼️ 老张图片生成 2.0 VIP</option>
                <option value="veo-3.1">🎨 Veo 3.1</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">🎬 视频生成模型</label>
              <p className="text-xs text-gray-400 mb-2">用于生成营销视频</p>
              <select
                value={videoModel}
                onChange={e => { setVideoModel(e.target.value); mark() }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="seedance-2.0">🎥 Seedance 2.0</option>
                <option value="happyhorse-1.0">🐴 HappyHorse 1.0</option>
              </select>
            </div>
          </div>
        </div>

        {/* Generation Model Provider Cards */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">生成模型 API Key</h2>
          <p className="text-sm text-gray-500 mb-4">配置图片和视频生成服务的 API Key</p>
          <div className="space-y-3">

            {/* 老张 provider card */}
            <div className={`border rounded-xl overflow-hidden transition-all ${laozhangApiKey ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🖼️</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">老张图片生成</span>
                      {config?.laozhang_api_key_configured ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ 已配置</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未配置</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">用于产品营销图片生成</p>
                  </div>
                </div>
                <a
                  href="https://laozhang.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-xs"
                >
                  获取 Key →
                </a>
              </div>
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  API Key{config?.laozhang_api_key_configured && <span className="text-green-600 font-normal ml-1">(已保存，留空则不修改)</span>}
                </label>
                <input
                  type="password"
                  placeholder={config?.laozhang_api_key_configured ? '输入新 Key 以覆盖...' : '输入老张 API Key...'}
                  value={laozhangApiKey}
                  onChange={e => { setLaozhangApiKey(e.target.value); mark() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            {/* 火山引擎 provider card */}
            <div className={`border rounded-xl overflow-hidden transition-all ${volcengineApiKey ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎬</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">火山引擎视频生成</span>
                      {config?.volcengine_api_key_configured ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ 已配置</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未配置</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">用于产品营销视频生成</p>
                  </div>
                </div>
                <a
                  href="https://console.volcengine.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-xs"
                >
                  获取 Key →
                </a>
              </div>
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  API Key{config?.volcengine_api_key_configured && <span className="text-green-600 font-normal ml-1">(已保存，留空则不修改)</span>}
                </label>
                <input
                  type="password"
                  placeholder={config?.volcengine_api_key_configured ? '输入新 Key 以覆盖...' : '输入火山引擎 API Key...'}
                  value={volcengineApiKey}
                  onChange={e => { setVolcengineApiKey(e.target.value); mark() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            {/* 阿里云 provider card */}
            <div className={`border rounded-xl overflow-hidden transition-all ${aliyunApiKey ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🐴</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">阿里云视频生成</span>
                      {config?.aliyun_api_key_configured ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ 已配置</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未配置</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">用于 HappyHorse 视频生成</p>
                  </div>
                </div>
                <a
                  href="https://dashscope.aliyun.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-xs"
                >
                  获取 Key →
                </a>
              </div>
              <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  API Key{config?.aliyun_api_key_configured && <span className="text-green-600 font-normal ml-1">(已保存，留空则不修改)</span>}
                </label>
                <input
                  type="password"
                  placeholder={config?.aliyun_api_key_configured ? '输入新 Key 以覆盖...' : '输入阿里云 API Key...'}
                  value={aliyunApiKey}
                  onChange={e => { setAliyunApiKey(e.target.value); mark() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Provider Cards */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">API Key 配置</h2>
          <p className="text-sm text-gray-500 mb-4">点击卡片展开配置，已配置的显示绿色徽章</p>
          <div className="space-y-3">
            {presets.map(preset => {
              const f = providerFields[preset.id] ?? { api_key: '', endpoint: preset.endpoint, vision_model: preset.vision_model, text_model: preset.text_model }
              const configured = isConfigured(preset.id)
              const isOpen = expanded[preset.id] ?? false
              const seeKey = showKey[preset.id] ?? false

              return (
                <div
                  key={preset.id}
                  className={`border rounded-xl overflow-hidden transition-all ${isOpen ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}
                >
                  {/* Card header — always visible, click to expand */}
                  <button
                    onClick={() => toggleExpand(preset.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{preset.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{preset.name}</span>
                          {configured ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ 已配置</span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">未配置</span>
                          )}
                          {!preset.supports_vision && (
                            <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">仅文本</span>
                          )}
                        </div>
                        {!isOpen && configured && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{f.endpoint}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <a
                        href={preset.api_key_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        获取 Key →
                      </a>
                      <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">
                      {/* API Key row */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          API Key {configured && <span className="text-green-600 font-normal">(已保存，留空则不修改)</span>}
                        </label>
                        <div className="relative">
                          <input
                            type={seeKey ? 'text' : 'password'}
                            placeholder={configured ? '输入新 Key 以覆盖...' : 'sk-... 或 apikey-...'}
                            value={f.api_key}
                            onChange={e => setField(preset.id, 'api_key', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(prev => ({ ...prev, [preset.id]: !seeKey }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                            tabIndex={-1}
                          >
                            {seeKey ? '🙈' : '👁'}
                          </button>
                        </div>
                      </div>

                      {/* Endpoint + models row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-3 sm:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">API Endpoint</label>
                          <input
                            type="url"
                            value={f.endpoint}
                            onChange={e => setField(preset.id, 'endpoint', e.target.value)}
                            placeholder={preset.endpoint}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        {preset.supports_vision && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">视觉模型</label>
                            <input
                              type="text"
                              value={f.vision_model}
                              onChange={e => setField(preset.id, 'vision_model', e.target.value)}
                              placeholder={preset.vision_model}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">文本模型</label>
                          <input
                            type="text"
                            value={f.text_model}
                            onChange={e => setField(preset.id, 'text_model', e.target.value)}
                            placeholder={preset.text_model}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      {/* Reset button */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => resetProvider(preset)}
                          className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                          重置为默认
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
        )}

        {/* Footer — last updated + save */}
        <div className="flex items-center justify-between pb-8">
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
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
    </MainLayout>
  )
}
