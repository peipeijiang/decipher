import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Film, Sparkles, Package, Video, Clock,
  TrendingUp, ArrowRight, Upload, PenTool, Clapperboard, Play,
  CheckCircle2, AlertCircle, Hourglass, Loader2,
} from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { CountUp } from '../components/ui/CountUp'

// ── types ──────────────────────────────────────────────────
interface StatBlock { total: number; completed: number; processing: number; failed: number }
interface DashboardStats { videos: StatBlock; products: StatBlock; creative: StatBlock; video_gen: StatBlock }
interface RecentItem { type: string; id: string; title: string; status: string; created_at: string }
interface DashboardData { stats: DashboardStats; recent: RecentItem[] }

// ── stat cards ─────────────────────────────────────────────
const statCards = [
  { key: 'videos' as const, label: '爆款复刻', icon: Film, path: '/workbench?tab=replica',
    gradient: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  { key: 'creative' as const, label: '创意生成', icon: Sparkles, path: '/workbench?tab=creative',
    gradient: 'linear-gradient(135deg, #fce7f3, #fbcfe8)' },
  { key: 'products' as const, label: '产品项目', icon: Package, path: '/workbench?tab=product',
    gradient: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
  { key: 'video_gen' as const, label: '视频生成', icon: Video, path: '/workbench?tab=video-gen',
    gradient: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' },
]

const quickActions = [
  { label: '分析视频',   desc: '上传 TikTok 视频，AI 拆解策略与镜头',       icon: Upload,       path: '/replica/new' },
  { label: '生成创意',   desc: '输入产品描述，获取多种营销角度',            icon: PenTool,      path: '/creative/new' },
  { label: '产品视频',   desc: '输入商品链接，自动生成视频素材',            icon: Clapperboard, path: '/product/new' },
  { label: '视频生成',   desc: '文生视频 / 图生视频',                       icon: Play,         path: '/video-gen' },
]

function formatRelative(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return '刚刚'
  if (sec < 3600) return `${Math.floor(sec / 60)} min`
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr`
  return `${Math.floor(sec / 86400)}d`
}

function sb(status: string) {
  const m: Record<string, { label: string; cls: string }> = {
    completed: { label: '完成', cls: 'bg-emerald-50 text-emerald-700' },
    processing: { label: '进行中', cls: 'bg-amber-50 text-amber-700' },
    pending: { label: '等待', cls: 'bg-gray-100 text-gray-600' },
    analyzing: { label: '分析中', cls: 'bg-amber-50 text-amber-700' },
    scraping: { label: '抓取中', cls: 'bg-amber-50 text-amber-700' },
    generating: { label: '生成中', cls: 'bg-amber-50 text-amber-700' },
    failed: { label: '失败', cls: 'bg-red-50 text-red-700' },
  }
  const x = m[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`tag ${x.cls}`}>{x.label}</span>
}

function tl(type: string) { return ({ video: '视频分析', product: '产品', creative: '创意', video_gen: '视频生成' } as any)[type] || type }
function ti(type: string) { return ({ video: Film, product: Package, creative: Sparkles, video_gen: Video } as any)[type] || Film }

// ── page ───────────────────────────────────────────────────
export default function DashboardPage() {
  const nav = useNavigate()
  const [d, setD] = useState<DashboardData | null>(null)
  const [ld, setLd] = useState(true)
  const [err, setErr] = useState('')

  const fetch = useCallback(async () => {
    try { setErr(''); const r = await axios.get('/api/dashboard'); setD(r.data) }
    catch { setErr('无法加载数据') } finally { setLd(false) }
  }, [])
  useEffect(() => { fetch() }, [fetch])

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-32 animate-fadeIn">

        {/* ═══ ATTENTION: Hero stats ═══ */}
        <section className="mb-24">
          <div className="max-w-3xl">
            <h1 className="text-[clamp(2.5rem,5vw,3.5rem)] font-bold text-gray-900 tracking-tight leading-[1.05]"
              style={{ letterSpacing: '-0.04em' }}>
              Decipher
            </h1>
            <p className="text-lg text-gray-500 mt-4 max-w-xl leading-relaxed">
              TikTok 爆款视频智能分析平台 — AI 拆解策略、镜头与创意
            </p>
          </div>

          {/* Stats row — 4 wide cards */}
          <div className="grid grid-cols-4 gap-4 mt-12">
            {statCards.map(c => {
              const s = d?.stats?.[c.key]; const t = s?.total ?? 0
              return (
                <div key={c.key} onClick={() => nav(c.path)}
                  className="card card-hover p-5 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                      style={{ background: c.gradient }}>
                      <c.icon className="w-5 h-5 text-gray-700" />
                    </div>
                    <TrendingUp className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors duration-700" />
                  </div>
                  <div className="text-[2rem] font-bold text-gray-900 tabular-nums tracking-tight leading-none">
                    {ld ? <span className="inline-block w-10 h-8 bg-gray-100 rounded animate-pulse" /> : <CountUp end={t} duration={1000} />}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 font-medium">{c.label}</div>
                  {!ld && s && (
                    <div className="flex gap-3 mt-4 pt-3 border-t border-gray-100">
                      <span className="flex items-center gap-1 text-xs text-gray-400"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{s.completed}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Hourglass className="w-3 h-3 text-amber-500" />{s.processing}</span>
                      {s.failed > 0 && <span className="flex items-center gap-1 text-xs text-gray-400"><AlertCircle className="w-3 h-3 text-red-400" />{s.failed}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {err && (
            <div className="mt-6 p-3 bg-red-50 text-sm text-red-700 rounded-2xl flex items-center gap-2"
              style={{ boxShadow: '0 0 0 1px rgba(220,38,38,0.12)' }}>
              <AlertCircle className="w-4 h-4" />{err}
              <button onClick={fetch} className="ml-auto text-red-600 underline cursor-pointer text-xs font-medium">重试</button>
            </div>
          )}
        </section>

        {/* ═══ INTEREST + DESIRE: Bento grid ═══ */}
        <section className="flex gap-6">
          {/* LEFT — recent activity (wider, 2:1 ratio) */}
          <div className="flex-[2]">
            <div className="card p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <Clock className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900 tracking-tight">最近活动</h2>
              </div>

              {ld ? (
                <div className="space-y-3">
                  {Array.from({length:5}).map((_,i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse" />
                      <div className="flex-1 space-y-1.5"><div className="h-3.5 bg-gray-100 rounded w-1/3 animate-pulse" /><div className="h-2.5 bg-gray-50 rounded w-1/2 animate-pulse" /></div>
                    </div>
                  ))}
                </div>
              ) : !d?.recent?.length ? (
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><Clock className="w-7 h-7 text-gray-300" /></div>
                  <p className="text-sm text-gray-400">还没有活动</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {d.recent.map(item => { const I = ti(item.type)
                    return (
                      <div key={item.id}
                        className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-gray-50 transition-colors duration-300 cursor-pointer"
                        onClick={() => { if (item.type==='video') nav(`/replica/${item.id}`); else if (item.type==='product') nav(`/product/${item.id}`); else nav('/workbench') }}>
                        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"><I className="w-4 h-4 text-gray-500" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{tl(item.type)}</span>{sb(item.status)}</div>
                          <p className="text-sm text-gray-700 truncate mt-1">{item.title}</p>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatRelative(item.created_at)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — quick actions (narrower) */}
          <div className="flex-1">
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-gray-900 tracking-tight mb-5">快速开始</h2>
              <div className="space-y-2.5">
                {quickActions.map(a => (
                  <button key={a.path} onClick={() => nav(a.path)}
                    className="w-full text-left p-3.5 rounded-2xl hover:bg-gray-50 transition-all duration-500 cursor-pointer group">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center flex-shrink-0"
                        style={{ boxShadow: '0 2px 8px rgba(217,119,6,0.2)' }}>
                        <a.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-800">{a.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all duration-500" />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{a.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ ACTION: Pill CTAs ═══ */}
        <section className="mt-32 text-center">
          <div className="card p-10 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">开始你的第一个项目</h2>
            <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              上传一段视频、输入一个产品链接，或描述你的创意方向 — AI 会处理剩下的
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <button onClick={() => nav('/replica/new')} className="btn-pill btn-pill-primary cursor-pointer">
                上传视频分析
                <span className="btn-trail"><ArrowRight className="w-3.5 h-3.5" /></span>
              </button>
              <button onClick={() => nav('/product/new')} className="btn-pill btn-pill-secondary cursor-pointer">
                添加产品链接
                <span className="btn-trail"><ArrowRight className="w-3.5 h-3.5" /></span>
              </button>
            </div>
          </div>
        </section>

      </div>
    </MainLayout>
  )
}
