import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Upload, BarChart3, Film, Sparkles, FileText, Loader2, AlertCircle, ArrowUpRight } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'

const SUPPORTED_FORMATS = ['mp4', 'mov', 'avi', 'webm']
const MAX_SIZE = 500 * 1024 * 1024

const FEATURES = [
  { icon: BarChart3, title: '智能策略分析', desc: '拆解营销策略、内容结构、节奏设计', gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)', delay: 0 },
  { icon: Film,      title: '镜头逆向解析', desc: '逐帧还原拍摄手法和镜头语言',         gradient: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', delay: 80 },
  { icon: Sparkles,  title: 'Prompt 逆向工程', desc: '生成可用于 Sora / 即梦的英文提示词', gradient: 'linear-gradient(135deg, #ddd6fe, #c4b5fd)', delay: 160 },
  { icon: FileText,  title: '脚本智能提取', desc: '提取语音文稿并标记关键转折点',         gradient: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', delay: 240 },
]

// Stagger-reveal via IntersectionObserver
function useStaggerReveal(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState<boolean[]>(Array(count).fill(false))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          FEATURES.forEach((_, i) => {
            setTimeout(() => setVisible(prev => { const n = [...prev]; n[i] = true; return n }), FEATURES[i].delay)
          })
          obs.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [count])

  return { ref, visible }
}

export default function HomePage() {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { ref: featuresRef, visible } = useStaggerReveal(FEATURES.length)

  const handleUpload = async (file: File) => {
    setError('')
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!SUPPORTED_FORMATS.includes(ext)) {
      setError(`不支持的格式，仅支持：${SUPPORTED_FORMATS.join('、')}`)
      return
    }
    if (file.size > MAX_SIZE) {
      setError('文件大小不能超过 500MB')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post('/api/videos/upload', form)
      navigate(`/replica/${res.data.video_id}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || '上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">

        {/* Hero */}
        <div className="text-center mb-14">
          <h1
            className="text-[2rem] font-bold tracking-tight mb-4 text-base-900"
            style={{ letterSpacing: '-0.035em', lineHeight: 1.2 }}
          >
            爆款视频分析
          </h1>
          <p className="text-[15px] text-base-500 max-w-lg mx-auto leading-relaxed">
            上传 TikTok 视频，AI 自动拆解营销策略、镜头语言，并生成可复用的创作提示词
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false)
            if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0])
          }}
          onClick={() => {
            if (uploading) return
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = SUPPORTED_FORMATS.map(f => `.${f}`).join(',')
            input.onchange = () => { if (input.files?.[0]) handleUpload(input.files[0]) }
            input.click()
          }}
          className={`relative rounded-[1.125rem] p-16 text-center cursor-pointer bg-white
            transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]
            ${dragOver ? 'ring-2 ring-amber-300 scale-[1.01] shadow-amber-lg' : 'shadow-card hover:shadow-card-hover hover:scale-[1.004]'}
            ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {/* Inner glow -- double-bezel */}
          <div className="absolute inset-[1px] rounded-[calc(1.125rem-1px)] pointer-events-none"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }} />

          {uploading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
              <p className="text-base font-medium text-base-700">正在上传分析…</p>
              <p className="text-sm text-base-400">较大文件可能需要几分钟</p>
            </div>
          ) : (
            <>
              {/* Upload icon with subtle pulse */}
              <div
                className="w-[4.5rem] h-[4.5rem] rounded-[1.125rem] flex items-center justify-center mx-auto mb-6"
                style={{
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  boxShadow: '0 2px 12px rgba(217,119,6,0.12), 0 0 0 1px rgba(217,119,6,0.06)',
                }}
              >
                <Upload
                  className="w-9 h-9 text-amber-600"
                  style={{ animation: dragOver ? 'none' : 'uploadPulse 2.5s cubic-bezier(0.32,0.72,0,1) infinite' }}
                />
              </div>

              <h3 className="text-lg font-semibold text-base-800 mb-2">拖拽视频到此处或点击上传</h3>
              <p className="text-[15px] text-base-400 mb-6">
                支持 {SUPPORTED_FORMATS.join('、')}，最大 500MB
              </p>

              {/* Button-in-button CTA */}
              <span className="btn-pill btn-pill-primary inline-flex mx-auto">
                <Upload className="w-4 h-4" />
                选择视频文件
                <span className="btn-trail">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </span>
            </>
          )}
        </div>

        {/* Error alert */}
        {error && (
          <div
            className="flex items-center gap-2 mt-5 p-3 bg-red-50 text-sm text-red-700 rounded-lg animate-slideUp"
            style={{ boxShadow: '0 0 0 1px rgba(220,38,38,0.15)' }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Features */}
        <div ref={featuresRef} className="mt-16">
          <h2 className="text-sm font-semibold text-base-400 uppercase tracking-wider text-center mb-8">
            分析能力
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`card card-hover rounded-xl p-6 flex items-start gap-4
                  transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]
                  ${visible[i] ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: f.gradient,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
                  }}
                >
                  <f.icon className="w-6 h-6 text-base-700" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-base-800 mb-1">{f.title}</h3>
                  <p className="text-sm text-base-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyframes injected for pulse + slide animations */}
        <style>{`
          @keyframes uploadPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%      { transform: scale(1.06); opacity: 0.85; }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .animate-slideUp {
            animation: slideUp 0.5s cubic-bezier(0.32,0.72,0,1) both;
          }
        `}</style>
      </div>
    </MainLayout>
  )
}
