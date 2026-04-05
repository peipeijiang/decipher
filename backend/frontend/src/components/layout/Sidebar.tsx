import { Home, Clock, Settings, Film } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: Home, label: '首页', path: '/' },
    { icon: Clock, label: '历史', path: '/history' },
    { icon: Settings, label: '设置', path: '/config' },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-20 bg-white border-r border-gray-200 flex flex-col items-center py-6 z-50">
      {/* Logo */}
      <div className="mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-accent to-indigo-600 rounded-xl flex items-center justify-center">
          <Film className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1
                transition-all duration-200
                ${isActive
                  ? 'bg-accent text-white shadow-lg'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
                }
              `}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Brand */}
      <div className="mt-auto">
        <div className="text-[10px] font-heading font-bold text-text-muted text-center">
          Viral
          <br />
          Lens
        </div>
      </div>
    </aside>
  )
}
