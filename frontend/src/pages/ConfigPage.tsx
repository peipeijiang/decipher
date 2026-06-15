import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import { ImageIcon, Clapperboard, Zap, Palette, ChevronDown, ChevronRight, Eye, EyeOff, Check, RotateCcw, Loader2 } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'

// ── Types ──────────────────────────────────────────────────
interface ProviderStatus { configured: boolean; endpoint: string; vision_model: string; text_model: string }
interface CurrentConfig {
  id: string; vision_model: string; analysis_model: string; image_model: string; video_model: string
  providers: Record<string, ProviderStatus>; temperature: number; max_tokens: number
  laozhang_api_key_configured: boolean; volcengine_api_key_configured: boolean
  aliyun_api_key_configured: boolean; updrama_api_key_configured: boolean; updated_at: string
}
interface ProviderPreset {
  id: string; name: string; endpoint: string; vision_model: string; text_model: string
  supports_vision: boolean; icon: string; api_key_url: string
}
interface ProviderFields { api_key: string; endpoint: string; vision_model: string; text_model: string }

// ── Generation provider definitions ────────────────────────
const GEN_PROVIDERS = [
  { id: 'laozhang', name: '老张图片生成', desc: '产品营销图片生成', icon: ImageIcon, getKeyUrl: 'https://laozhang.ai', configuredKey: 'laozhang_api_key_configured' as const },
  { id: 'volcengine', name: '火山引擎视频', desc: 'Seedance 2.0 视频生成', icon: Clapperboard, getKeyUrl: 'https://console.volcengine.com', configuredKey: 'volcengine_api_key_configured' as const },
  { id: 'aliyun', name: '阿里云视频/图片', desc: 'Wan 2.6 / Qwen 生成', icon: Zap, getKeyUrl: 'https://dashscope.aliyun.com', configuredKey: 'aliyun_api_key_configured' as const },
  { id: 'updrama', name: 'Updrama 图片', desc: 'Updrama Image 2 图片生成', icon: Palette, getKeyUrl: 'https://up.lk888.ai', configuredKey: 'updrama_api_key_configured' as const },
]

const IMAGE_MODELS = [
  { value: 'laozhang-image-2-vip', label: '老张图片 2.0 VIP (推荐)' },
  { value: 'updrama-image-2', label: 'Updrama Image 2' },
  { value: 'qwen-image-2.0-pro', label: 'Qwen Image 2.0 Pro' },
]
const VIDEO_MODELS = [
  { value: 'seedance-2.0', label: 'Seedance 2.0 (火山引擎)' },
  { value: 'veo-3.1', label: 'Veo 3.1 (老张)' },
  { value: 'wan-2.6', label: 'Wan 2.6 (阿里云)' },
  { value: 'happyhorse-1.0', label: 'HappyHorse 1.0 (阿里云)' },
]

// ── Model role card ────────────────────────────────────────
interface RoleCardProps {
  label: string; sub: string; value: string; options: { value: string; label: string }[]
  onChange: (v: string) => void; onDirty: () => void
}
function RoleCard({ label, sub, value, options, onChange, onDirty }: RoleCardProps) {
  return (
    <div className="card rounded-xl p-5">
      <label className="text-sm font-semibold text-gray-800">{label}</label>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">{sub}</p>
      <select value={value} onChange={e => { onChange(e.target.value); onDirty() }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-all">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}


// ── Main page ──────────────────────────────────────────────
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
  const [updramaApiKey, setUpdramaApiKey] = useState('')

  // Fetch current config + provider presets
  useEffect(() => {
    Promise.all([
      api.get<CurrentConfig>('/api/config/models/current'),
      api.get<ProviderPreset[]>('/api/config/providers'),
    ]).then(([configRes, presetsRes]) => {
      const c = configRes.data; const ps = presetsRes.data
      setConfig(c); setPresets(ps)
      setVisionModel(c.vision_model); setAnalysisModel(c.analysis_model)
      setImageModel(c.image_model); setVideoModel(c.video_model)
      setTemperature(c.temperature); setMaxTokens(c.max_tokens)
      const fields: Record<string, ProviderFields> = {}
      for (const p of ps) {
        const cur = c.providers[p.id] ?? {}
        fields[p.id] = { api_key: '', endpoint: cur.endpoint || p.endpoint, vision_model: cur.vision_model || p.vision_model, text_model: cur.text_model || p.text_model }
      }
      setProviderFields(fields)
    }).catch(() => setError('加载配置失败'))
  }, [])

  const mark = useCallback(() => setDirty(true), [])
  const setField = (pid: string, key: keyof ProviderFields, value: string) => { setProviderFields(prev => ({ ...prev, [pid]: { ...prev[pid], [key]: value } })); mark() }
  const resetProvider = (preset: ProviderPreset) => { setProviderFields(prev => ({ ...prev, [preset.id]: { api_key: '', endpoint: preset.endpoint, vision_model: preset.vision_model, text_model: preset.text_model } })); mark() }
  const isConfigured = (pid: string) => config?.providers[pid]?.configured ?? false

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      const providers: Record<string, Partial<ProviderFields>> = {}
      for (const [pid, f] of Object.entries(providerFields)) {
        providers[pid] = { endpoint: f.endpoint, vision_model: f.vision_model, text_model: f.text_model, ...(f.api_key ? { api_key: f.api_key } : {}) }
      }
      if (aliyunApiKey) {
        const af = providerFields['aliyun']; const ap = presets.find(p => p.id === 'aliyun')
        if (ap && af) providers['aliyun'] = { api_key: aliyunApiKey, endpoint: af.endpoint || ap.endpoint, vision_model: af.vision_model || ap.vision_model, text_model: af.text_model || ap.text_model }
      }
      const res = await api.patch<CurrentConfig>('/api/config/models', {
        vision_model: visionModel, analysis_model: analysisModel, image_model: imageModel, video_model: videoModel,
        temperature, max_tokens: maxTokens, providers,
        ...(laozhangApiKey ? { laozhang_api_key: laozhangApiKey } : {}),
        ...(volcengineApiKey ? { volcengine_api_key: volcengineApiKey } : {}),
        ...(aliyunApiKey ? { aliyun_api_key: aliyunApiKey } : {}),
        ...(updramaApiKey ? { updrama_api_key: updramaApiKey } : {}),
      })
      setConfig(res.data); setDirty(false); setSaved(true)
      setProviderFields(prev => { const n = { ...prev }; for (const pid of Object.keys(n)) n[pid] = { ...n[pid], api_key: '' }; return n })
      setLaozhangApiKey(''); setVolcengineApiKey(''); setAliyunApiKey(''); setUpdramaApiKey('')
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) { setError(e.response?.data?.detail || '保存失败') }
    finally { setSaving(false) }
  }

  const textPresets = presets.filter(p => p.supports_vision)
  const genKeyState: Record<string, { val: string; set: (v: string) => void; configured: boolean }> = {
    laozhang: { val: laozhangApiKey, set: setLaozhangApiKey, configured: config?.laozhang_api_key_configured ?? false },
    volcengine: { val: volcengineApiKey, set: setVolcengineApiKey, configured: config?.volcengine_api_key_configured ?? false },
    aliyun: { val: aliyunApiKey, set: setAliyunApiKey, configured: config?.aliyun_api_key_configured ?? false },
    updrama: { val: updramaApiKey, set: setUpdramaApiKey, configured: config?.updrama_api_key_configured ?? false },
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-12 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">模型配置</h1>
            <p className="text-sm text-gray-500 mt-1">分配模型角色，管理各提供商的 API Key 和端点</p>
          </div>
          <button onClick={handleSave} disabled={saving || !dirty}
            className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
            style={{ background: saving ? '#92400e' : '#d97706', boxShadow: '0 2px 8px rgba(217,119,6,0.25)' }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />保存中…</> : <><Check className="w-4 h-4" />保存配置</>}
          </button>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {saved && <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" />已保存</p>}
          </div>
        </div>



        {/* ── Section 1: Model Role Assignment ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">模型角色分配</h2>
          <div className="grid grid-cols-2 gap-4">
            <RoleCard label="视觉分析模型" sub="逐帧识别画面、构图、光线、主体" value={visionModel}
              options={presets.filter(p => p.supports_vision).map(p => ({ value: p.id, label: p.name }))}
              onChange={setVisionModel} onDirty={mark} />
            <RoleCard label="综合分析模型" sub="策略分析、分镜解析、提示词生成、语音分段" value={analysisModel}
              options={presets.map(p => ({ value: p.id, label: p.name }))}
              onChange={setAnalysisModel} onDirty={mark} />
            <RoleCard label="图片生成模型" sub="生成分镜图、产品营销图、说明书" value={imageModel}
              options={IMAGE_MODELS}
              onChange={setImageModel} onDirty={mark} />
            <RoleCard label="视频生成模型" sub="AI 生成最终营销短视频" value={videoModel}
              options={VIDEO_MODELS}
              onChange={setVideoModel} onDirty={mark} />
          </div>
        </section>

        {/* ── Section 2: API Key Configuration ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">模型提供商</h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-gray-500">配置各模型提供商的 API Key 和端点参数</p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                {saved && <p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" />已保存</p>}
              </div>
            </div>
            <button onClick={handleSave} disabled={saving || !dirty}
              className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all duration-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
              style={{ background: saving ? '#92400e' : '#d97706', boxShadow: '0 2px 8px rgba(217,119,6,0.25)' }}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />保存中…</> : <><Check className="w-4 h-4" />保存配置</>}
            </button>
          </div>

          {/* Sub: 文本/视觉模型 */}
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">文本 & 视觉分析模型</h3>
          <div className="space-y-2 mb-6">
            {textPresets.map(preset => {
              const f = providerFields[preset.id] ?? { api_key: '', endpoint: preset.endpoint, vision_model: preset.vision_model, text_model: preset.text_model }
              const configured = isConfigured(preset.id)
              const isOpen = expanded[preset.id] ?? false
              const seeKey = showKey[preset.id] ?? false
              return (
                <div key={preset.id} className={`border rounded-xl overflow-hidden transition-all ${isOpen ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
                  <button onClick={() => setExpanded(prev => ({ ...prev, [preset.id]: !prev[preset.id] }))}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50/50 transition-colors text-left cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{preset.icon}</span>
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{preset.name}</span>
                        {configured && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">已配置</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!configured && <span className="text-[10px] text-gray-400">未配置</span>}
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-2">
                        <label className="flex-1">
                          <span className="block text-xs font-medium text-gray-600 mb-1">API Key {configured && <span className="text-green-600 font-normal">(已保存，留空不修改)</span>}</span>
                          <div className="relative">
                            <input type={seeKey ? 'text' : 'password'} value={f.api_key}
                              onChange={e => setField(preset.id, 'api_key', e.target.value)}
                              placeholder={configured ? '输入新 Key 以覆盖…' : `输入 ${preset.name} API Key…`}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm font-mono focus:outline-none focus:border-amber-400" />
                            <button onClick={() => setShowKey(prev => ({ ...prev, [preset.id]: !prev[preset.id] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                              {seeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </label>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-3 sm:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint</label>
                          <input type="url" value={f.endpoint} onChange={e => setField(preset.id, 'endpoint', e.target.value)}
                            placeholder={preset.endpoint} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                        </div>
                        {preset.supports_vision && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">视觉模型</label>
                            <input type="text" value={f.vision_model} onChange={e => setField(preset.id, 'vision_model', e.target.value)}
                              placeholder={preset.vision_model} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">文本模型</label>
                          <input type="text" value={f.text_model} onChange={e => setField(preset.id, 'text_model', e.target.value)}
                            placeholder={preset.text_model} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                        </div>
                      </div>
                      {preset.api_key_url && (
                        <div className="flex items-center justify-between pt-1">
                          <a href={preset.api_key_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-amber-600 hover:text-amber-700">获取 Key →</a>
                          <button onClick={() => resetProvider(preset)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
                            <RotateCcw className="w-3 h-3" />重置默认</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Sub: 生成模型 */}
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">图片 & 视频生成模型</h3>
          <div className="space-y-2">
            {GEN_PROVIDERS.map(gp => {
              const ks = genKeyState[gp.id]
              const isOpen = expanded[`gen_${gp.id}`] ?? false
              const seeKey = showKey[`gen_${gp.id}`] ?? false
              const Icon = gp.icon
              return (
                <div key={gp.id} className={`border rounded-xl overflow-hidden transition-all ${isOpen ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
                  <button onClick={() => setExpanded(prev => ({ ...prev, [`gen_${gp.id}`]: !prev[`gen_${gp.id}`] }))}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50/50 transition-colors text-left cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-gray-600" />
                      <div>
                        <span className="font-medium text-gray-900 text-sm">{gp.name}</span>
                        {ks.configured && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">已配置</span>}
                        <p className="text-[11px] text-gray-400 mt-0.5">{gp.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!ks.configured && <span className="text-[10px] text-gray-400">未配置</span>}
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <label>
                        <span className="block text-xs font-medium text-gray-600 mb-1">API Key {ks.configured && <span className="text-green-600 font-normal">(已保存，留空不修改)</span>}</span>
                        <div className="relative">
                          <input type={seeKey ? 'text' : 'password'} value={ks.val}
                            onChange={e => { ks.set(e.target.value); mark() }}
                            placeholder={ks.configured ? '输入新 Key 以覆盖…' : `输入 ${gp.name} API Key…`}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm font-mono focus:outline-none focus:border-amber-400" />
                          <button onClick={() => setShowKey(prev => ({ ...prev, [`gen_${gp.id}`]: !prev[`gen_${gp.id}`] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                            {seeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </label>
                      <a href={gp.getKeyUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-block text-xs text-amber-600 hover:text-amber-700">获取 Key →</a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Section 3: Global Parameters ── */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-1">全局参数</h2>
          <p className="text-sm text-gray-500 mb-5">所有模型共享的温度和 token 限制</p>
          <div className="card rounded-xl p-6">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Temperature</label>
                  <span className="text-sm font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{temperature}</span>
                </div>
                <input type="range" min="0" max="1" step="0.1" value={temperature}
                  onChange={e => { setTemperature(parseFloat(e.target.value)); mark() }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>精确</span><span>平衡</span><span>创意</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Tokens</label>
                <input type="number" value={maxTokens}
                  onChange={e => { setMaxTokens(parseInt(e.target.value) || 4096); mark() }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                  min={100} max={128000} step={100} />
                <p className="text-[11px] text-gray-400 mt-1">最大输出长度，范围 100-128000</p>
              </div>
            </div>
          </div>
        </section>



      </div>
    </MainLayout>
  )
}
