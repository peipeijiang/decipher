import { useState } from 'react'
import {
  Sparkles, PenTool, Clapperboard, Upload, History, Wand2,
  Clock3, PlusSquare, FolderOpen, LayoutGrid, Settings, ChevronDown,
  ChevronRight, Video, Play, Home, User, GitBranch,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { NAV_CONFIG } from '../../config/navigation'

const IM: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Sparkles, PenTool, Clapperboard, Upload, History, Wand2, GitBranch,
  Clock3, PlusSquare, FolderOpen, LayoutGrid, Settings, Video, Play,
}

function NI({ name, className }: { name: string; className?: string }) {
  const Icon = IM[name]; if (!Icon) return null; return <Icon className={className} />
}

function childActive(children: { path: string }[], p: string) {
  return children.some(c => p.startsWith(c.path))
}

export function Sidebar() {
  const n = useNavigate(); const l = useLocation()
  const [ex, setEx] = useState<Record<string,boolean>>(() => {
    const ini: Record<string,boolean> = {}
    for (const s of NAV_CONFIG.main) {
      if ((s.children?.length??0) > 1) ini[s.id] = childActive(s.children!, l.pathname)
    }
    return ini
  })

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white flex flex-col py-6 z-40 overflow-y-auto"
      style={{
        boxShadow: '1px 0 0 rgba(146,64,14,0.04), 1px 0 8px rgba(146,64,14,0.02)'
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 mb-3 cursor-pointer group" onClick={() => n('/')}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden transition-transform duration-500 group-hover:scale-105"
          style={{ boxShadow: '0 3px 12px rgba(15,23,42,0.16)' }}>
          <img src="/logo/decipher-mark.png" alt="Decipher" className="w-full h-full object-cover" />
        </div>
        <span className="text-base font-bold text-gray-900 tracking-tight">Decipher</span>
      </div>

      {/* Home */}
      <div className="px-3 mb-4">
        <button onClick={() => n('/')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[15px] font-semibold transition-all duration-500 cursor-pointer ${
            l.pathname==='/' ? 'bg-amber-500 text-white shadow-[0_3px_12px_rgba(217,119,6,0.25)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}>
          <Home className="w-[18px] h-[18px] flex-shrink-0" />首页
        </button>
      </div>

      <nav className="flex-1 px-3">
        {NAV_CONFIG.main.map(s => {
          const cc = s.children?.length ?? 0; const isG = cc > 1

          if (!isG) {
            const a = l.pathname === s.path || (s.path!=='/replica/new'&&s.path!=='/creative/new'&&s.path!=='/product/new'&&l.pathname.startsWith(s.path))
            return (
              <button key={s.id} onClick={() => n(s.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[15px] font-semibold mb-1 transition-all duration-500 cursor-pointer ${
                  a ? 'bg-amber-500 text-white shadow-[0_3px_12px_rgba(217,119,6,0.25)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}>
                <NI name={s.icon} className="w-[18px] h-[18px] flex-shrink-0" />{s.label}
              </button>
            )
          }

          const io = ex[s.id] ?? false
          const hac = childActive(s.children!, l.pathname)
          return (
            <div key={s.id} className="mb-1">
              <button onClick={() => setEx(p=>({...p,[s.id]:!p[s.id]}))}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-[15px] font-semibold transition-all duration-500 cursor-pointer ${
                  hac ? 'text-amber-700 bg-amber-50' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`} aria-expanded={io}>
                <div className="flex items-center gap-3"><NI name={s.icon} className="w-[18px] h-[18px] flex-shrink-0" /><span>{s.label}</span></div>
                {io ? <ChevronDown className="w-4 h-4 opacity-60" /> : <ChevronRight className="w-4 h-4 opacity-60" />}
              </button>
              {io && (
                <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-200 pl-3">
                  {s.children!.map(c => {
                    const a = l.pathname === c.path || l.pathname.startsWith(c.path)
                    return (
                      <button key={c.path} onClick={() => n(c.path)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-semibold transition-all duration-500 cursor-pointer text-left ${
                          a ? 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(217,119,6,0.2)]' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                        }`}>
                        <NI name={c.icon} className="w-4 h-4 flex-shrink-0" />{c.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Secondary nav — 工作台 + 设置 */}
      <div className="px-3 pt-2 border-t border-gray-100">
        {NAV_CONFIG.secondary.map(item => {
          const a = l.pathname === item.path || l.pathname.startsWith(item.path)
          return (
            <button key={item.path} onClick={() => n(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-[15px] font-semibold mb-1 transition-all duration-500 cursor-pointer ${
                a ? 'bg-amber-500 text-white shadow-[0_3px_12px_rgba(217,119,6,0.25)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}>
              <NI name={item.icon} className="w-[18px] h-[18px] flex-shrink-0" />{item.label}
            </button>
          )
        })}
      </div>

      {/* User area */}
      <div className="mt-auto pt-5 px-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #d97706, #92400e)' }}>
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-700 truncate">本地工作区</div>
            <div className="text-[11px] text-gray-400">离线模式</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
