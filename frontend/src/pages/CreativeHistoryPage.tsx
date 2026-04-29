import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Clock, Inbox, Trash2 } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { ListSkeleton } from '../components/ui/LoadingSkeleton'

interface CreativeHistoryItem {
  id: string
  description: string
  style: string
  count: number
  created_at: string
  results?: any[]
}

export default function CreativeHistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<CreativeHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Replace with actual API call when backend endpoint is ready
    // For now, show placeholder
    setTimeout(() => {
      setItems([])
      setLoading(false)
    }, 500)
  }, [])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除该创意记录？此操作不可撤销。')) return
    // TODO: Implement delete API call
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const handleItemClick = (item: CreativeHistoryItem) => {
    // Navigate to creative page with restore state
    navigate('/creative/new', {
      state: {
        restore: {
          description: item.description,
          results: item.results || [],
        },
      },
    })
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-6 pt-10 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">创意历史</h1>
          {!loading && items.length > 0 && (
            <span className="text-sm text-gray-400">{items.length} 条记录</span>
          )}
        </div>

        {loading ? (
          <ListSkeleton count={5} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">暂无创意记录</h3>
            <p className="text-sm text-gray-400 mb-6">还没有生成过创意，开始第一次创意生成吧！</p>
            <button
              onClick={() => navigate('/creative/new')}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors cursor-pointer"
            >
              新建创意
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="group bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex justify-between items-center hover:border-blue-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.description}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString('zh-CN')}
                      </span>
                      <span>{item.count} 个创意</span>
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{item.style}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(item.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150 cursor-pointer"
                  aria-label="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
