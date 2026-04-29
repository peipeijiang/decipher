import { useState } from 'react'
import {
  Film,
  Sparkles,
  PenTool,
  Clapperboard,
  Upload,
  History,
  Wand2,
  Clock3,
  PlusSquare,
  FolderOpen,
  LayoutGrid,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { NAV_CONFIG } from '../../config/navigation'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  PenTool,
  Clapperboard,
  Upload,
  History,
  Wand2,
  Clock3,
  PlusSquare,
  FolderOpen,
  LayoutGrid,
  Settings,
}

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon className={className} />
}

function isChildActive(children: { path: string }[], pathname: string): boolean {
  return children.some(child => pathname.startsWith(child.path))
}

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  // Track which sections are expanded; default open if a child is active
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const section of NAV_CONFIG.main) {
      initial[section.id] = isChildActive(section.children, location.pathname)
    }
    return initial
  })

  const toggleSection = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 bg-white border-r border-gray-200 flex flex-col py-4 z-50 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Film className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-bold text-gray-900">ViralLens</span>
      </div>

      {/* Main section label */}
      <div className="px-4 mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">主要功能</span>
      </div>

      {/* Main nav sections */}
      <nav className="flex-1 px-2">
        {NAV_CONFIG.main.map(section => {
          const isOpen = expanded[section.id] ?? false
          const hasActiveChild = isChildActive(section.children, location.pathname)

          return (
            <div key={section.id} className="mb-0.5">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium
                  transition-colors duration-150 cursor-pointer
                  ${hasActiveChild
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2.5">
                  <NavIcon name={section.icon} className="w-4 h-4 flex-shrink-0" />
                  <span>{section.label}</span>
                </div>
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                }
              </button>

              {/* Children */}
              {isOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
                  {section.children.map(child => {
                    const isActive = location.pathname === child.path ||
                      (child.path !== '/replica/new' && child.path !== '/creative/new' && child.path !== '/product/new' && location.pathname.startsWith(child.path))

                    return (
                      <button
                        key={child.path}
                        onClick={() => navigate(child.path)}
                        className={`
                          w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium
                          transition-colors duration-150 cursor-pointer text-left
                          ${isActive
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                          }
                        `}
                      >
                        <NavIcon name={child.icon} className="w-3.5 h-3.5 flex-shrink-0" />
                        {child.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Secondary section label */}
        <div className="px-1 mt-4 mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">数据与管理</span>
        </div>

        {/* Secondary nav items */}
        {NAV_CONFIG.secondary.map(item => {
          const isActive = location.pathname === item.path

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5
                transition-colors duration-150 cursor-pointer
                ${isActive
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <NavIcon name={item.icon} className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
