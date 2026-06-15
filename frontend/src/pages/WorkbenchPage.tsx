import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Film, Sparkles, Package, Video, Clock, Search, Inbox, Trash2, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ListSkeleton } from '../components/ui/LoadingSkeleton'

type ItemType = 'replica' | 'creative' | 'product' | 'video-gen'
type FilterTab = 'all' | 'replica' | 'creative' | 'product' | 'video-gen'

interface BaseItem { id: string; type: ItemType; title: string; created_at: string }
interface ReplicaItem extends BaseItem { type: 'replica'; video_id: string; filename: string; status: 'pending'|'processing'|'completed'|'failed'; duration?: number }
interface CreativeItem extends BaseItem { type: 'creative'; description: string; style: string; count: number }
interface ProductItem extends BaseItem { type: 'product'; product_id: string; url: string; status: 'pending'|'analyzing'|'completed'|'failed' }
interface VideoGenItem extends BaseItem { type: 'video-gen'; gen_id: string; model: string; status: 'pending'|'generating'|'completed'|'failed' }
type WorkbenchItem = ReplicaItem | CreativeItem | ProductItem | VideoGenItem

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'replica', label: '爆款复刻' },
  { key: 'creative', label: '创意' }, { key: 'product', label: '产品' }, { key: 'video-gen', label: '视频生成' },
]

const CFG: Record<ItemType, { icon: typeof Film; label: string; tag: string; g: string; emptyMsg: string; emptyDesc: string; emptyPath: string; emptyBtn: string }> = {
  replica:  { icon: Film, label: '爆款复刻', tag: 'bg-amber-50 text-amber-700', g: 'linear-gradient(135deg, #fef3c7, #fde68a)', emptyMsg: '还没有分析过视频', emptyDesc: '上传一段 TikTok 视频，AI 会自动拆解营销策略、镜头语言和创作提示词', emptyPath: '/replica/new', emptyBtn: '上传第一个视频' },
  creative: { icon: Sparkles, label: '创意生成', tag: 'bg-pink-50 text-pink-700', g: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', emptyMsg: '还没有生成创意', emptyDesc: '输入产品描述或上传图片，AI 为你生成多种营销角度和文案', emptyPath: '/creative/new', emptyBtn: '生成第一个创意' },
  product:  { icon: Package, label: '产品项目', tag: 'bg-emerald-50 text-emerald-700', g: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', emptyMsg: '还没有产品项目', emptyDesc: '输入商品链接，自动抓取信息并生成视频素材和文档', emptyPath: '/product/new', emptyBtn: '添加第一个产品' },
  'video-gen': { icon: Video, label: '视频生成', tag: 'bg-blue-50 text-blue-700', g: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', emptyMsg: '还没有生成视频', emptyDesc: '输入提示词或上传参考图，选择模型即可生成视频', emptyPath: '/video-gen', emptyBtn: '生成第一个视频' },
}

function fm(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return '刚刚'; if (s < 3600) return `${Math.floor(s/60)}min`;
  if (s < 86400) return `${Math.floor(s/3600)}hr`;
  if (s < 604800) return `${Math.floor(s/86400)}d`;
  return new Date(iso).toLocaleDateString('zh-CN')
}
function ms(st: string): 'pending'|'processing'|'completed'|'failed' {
  if (['analyzing','scraping','generating','extracting'].includes(st)) return 'processing'
  if (st === 'ready') return 'completed'
  return st as any
}

// ── Delete confirm dialog ──
function DeleteDialog({ item, onConfirm, onClose }: { item: WorkbenchItem; onConfirm: ()=>void; onClose: ()=>void }) {
  const c = CFG[item.type]
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 backdrop-blur-sm animate-scaleIn" onClick={onClose}>
      <div className="card p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4"><h3 className="text-base font-semibold text-gray-900">确认删除</h3><button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer rounded-lg"><X className="w-4 h-4"/></button></div>
        <p className="text-sm text-gray-600 mb-2">确定删除这条{c.label}记录？</p>
        <p className="text-sm text-gray-500 truncate mb-5">{item.title}</p>
        <p className="text-xs text-gray-400 mb-5">此操作不可撤销</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-pill btn-pill-secondary text-sm px-4 py-2 cursor-pointer">取消</button>
          <button onClick={onConfirm} className="btn-pill cursor-pointer text-sm px-4 py-2" style={{background:'#dc2626',color:'white',boxShadow:'0 2px 6px rgba(220,38,38,0.2)'}}>删除</button>
        </div>
      </div>
    </div>
  )
}

// ── Item row ──
function ItemRow({ item, onDel }: { item: WorkbenchItem; onDel: (e:React.MouseEvent)=>void }) {
  const nav = useNavigate(); const c = CFG[item.type]; const I = c.icon
  const ip = ('status' in item) && ['processing','analyzing','scraping','generating','extracting','pending'].includes(item.status)
  const ic = ('status' in item) && item.status === 'completed'
  const iff = ('status' in item) && item.status === 'failed'

  const sub = useMemo(() => {
    if (item.type==='creative') return `${item.count}个角度`
    if (item.type==='product') return (item as ProductItem).url
    if (item.type==='video-gen') return (item as VideoGenItem).model
    if (item.type==='replica' && item.duration) { const m=Math.floor(item.duration/60); const s=String(Math.round(item.duration%60)).padStart(2,'0'); return `时长 ${m}:${s}` }
    return ''
  }, [item])

  return (
    <div onClick={() => { if(item.type==='replica') nav(`/replica/${item.video_id}`); else if(item.type==='product') nav(`/product/${item.product_id}`); else if(item.type==='creative') nav('/creative/new'); else nav('/video-gen') }}
      className="card card-hover px-4 py-4 flex items-center gap-4 animate-slideUp group">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 relative" style={{background:c.g}}>
        <I className="w-5 h-5 text-gray-700" />
        {ip && <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-white animate-pulse" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`tag ${c.tag}`}>{c.label}</span>
          <span className="text-sm font-semibold text-gray-800 truncate">{item.title}</span>
          {ic && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
          {iff && <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {sub && <span className="truncate max-w-[300px]">{sub}</span>}
          <span className="flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{fm(item.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {'status' in item && <StatusBadge status={ms(item.status)} />}
        {ip && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
        <button onClick={onDel} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-300 cursor-pointer ml-1" aria-label="删除"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────
export default function WorkbenchPage() {
  const nav = useNavigate(); const [sp] = useSearchParams(); const it = (sp.get('tab') as FilterTab) || 'all'
  const [items, setItems] = useState<WorkbenchItem[]>([]); const [ld, setLd] = useState(true)
  const [tab, setTab] = useState<FilterTab>(it); const [q, setQ] = useState(''); const [dt, setDt] = useState<WorkbenchItem | null>(null)
  useEffect(() => { setTab(it) }, [it])

  useEffect(() => {
    (async () => {
      try {
        const [rr, cr, pr, vr] = await Promise.allSettled([
          axios.get('/api/reports'),
          axios.get('/api/creative/history'),
          axios.get('/api/products'),
          axios.get('/api/video-gen', { params: { limit: 50 } }),
        ])
        const reports = rr.status === 'fulfilled' ? rr.value.data : []
        const creative = cr.status === 'fulfilled' ? cr.value.data : []
        const products = pr.status === 'fulfilled' ? pr.value.data : []
        const videoGen = vr.status === 'fulfilled' ? vr.value.data : { items: [] }
        ;[rr, cr, pr, vr].forEach((res, idx) => {
          if (res.status === 'rejected') console.warn(`Workbench source ${idx} failed`, res.reason)
        })
        const ri: ReplicaItem[] = reports.map((i:any)=>({id:`replica-${i.video_id}`,type:'replica' as const,video_id:i.video_id,title:i.filename,filename:i.filename,status:i.status,duration:i.duration,created_at:i.created_at}))
        const ci: CreativeItem[] = creative.map((i:any)=>({id:`creative-${i.id}`,type:'creative' as const,title:i.description||'创意改写',description:i.description||'',style:'',count:i.results?.length||0,created_at:i.created_at}))
        const pi: ProductItem[] = (products||[]).map((i:any)=>({id:`product-${i.id}`,type:'product' as const,product_id:i.id,title:i.title||i.url||'产品',url:i.url||'',status:i.status,created_at:i.created_at}))
        const vi: VideoGenItem[] = (videoGen.items||[]).map((i:any)=>({id:`video-gen-${i.id}`,type:'video-gen' as const,gen_id:i.id,title:i.prompt?.slice(0,60)+(i.prompt?.length>60?'...':'')||'视频生成',model:i.model,status:i.status,created_at:i.created_at}))
        const all = [...ri,...ci,...pi,...vi]; all.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()); setItems(all)
      } catch {} finally { setLd(false) }
    })()
  }, [])

  const hd = async () => { if(!dt)return; const i=dt; setDt(null)
    try { if(i.type==='replica')await axios.delete(`/api/reports/${i.video_id}`); else if(i.type==='creative')await axios.delete(`/api/creative/history/${i.id.replace('creative-','')}`); else if(i.type==='product')await axios.delete(`/api/products/${i.product_id}`); setItems(p=>p.filter(x=>x.id!==i.id)) } catch {} }

  const fi = items.filter(i => { if(tab!=='all'&&i.type!==tab)return false; if(q.trim())return i.title.toLowerCase().includes(q.toLowerCase()); return true })

  const st = useMemo(() => { const c={total:items.length,processing:0,completed:0,failed:0}
    items.forEach(i=>{if('status' in i){if(i.status==='completed')c.completed++;else if(i.status==='failed')c.failed++;else if(['pending','processing','analyzing','scraping','generating','extracting'].includes(i.status))c.processing++}}); return c }, [items])

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-32 animate-fadeIn">

        {/* Header card */}
        <div className="card px-6 py-5 mb-8">
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold text-gray-900 tracking-tight">工作台</h1><p className="text-sm text-gray-400 mt-1">所有历史记录</p></div>
            <div className="flex gap-5 text-center">
              {!ld && <><div><div className="text-xl font-bold text-gray-800 tabular-nums">{st.total}</div><div className="text-[10px] text-gray-400 font-medium">总计</div></div>
                <div><div className="text-xl font-bold text-emerald-600 tabular-nums">{st.completed}</div><div className="text-[10px] text-gray-400 font-medium">完成</div></div>
                <div><div className="text-xl font-bold text-amber-600 tabular-nums">{st.processing}</div><div className="text-[10px] text-gray-400 font-medium">进行中</div></div>
                {st.failed>0&&<div><div className="text-xl font-bold text-red-500 tabular-nums">{st.failed}</div><div className="text-[10px] text-gray-400 font-medium">失败</div></div>}</>}
            </div>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索记录..." className="input w-full pl-10 pr-4 py-2.5" />
          </div>
          <div className="flex gap-1.5 bg-gray-100 rounded-full p-1">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={()=>setTab(t.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer ${
                  tab===t.key ? 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(217,119,6,0.25)]' : 'text-gray-500 hover:text-gray-700'
                }`}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        {ld ? <ListSkeleton count={8} /> : fi.length===0 ? (
          items.length===0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-6"><Inbox className="w-10 h-10 text-gray-300" /></div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">工作台还是空的</h3>
              <p className="text-sm text-gray-400 max-w-sm leading-relaxed">使用左侧导航中的功能开始你的第一个项目</p>
              <div className="flex gap-3 mt-8">
                {(['replica','creative','product'] as const).map(t => { const c=CFG[t]
                  return <button key={t} onClick={()=>nav(c.emptyPath)} className="btn-pill btn-pill-secondary text-sm cursor-pointer">{c.emptyBtn}</button>
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center mb-5"><Search className="w-8 h-8 text-gray-300" /></div>
              <h3 className="text-base font-semibold text-gray-700 mb-1">没有匹配的记录</h3><p className="text-sm text-gray-400">尝试调整搜索词或筛选条件</p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {fi.map(item => <ItemRow key={item.id} item={item} onDel={e=>{e.stopPropagation();setDt(item)}} />)}
          </div>
        )}

        {dt && <DeleteDialog item={dt} onConfirm={hd} onClose={()=>setDt(null)} />}
      </div>
    </MainLayout>
  )
}
