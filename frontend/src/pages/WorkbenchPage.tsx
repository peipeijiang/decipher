import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Film, Sparkles, Package, Clock, Search, Inbox, Trash2 } from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ListSkeleton } from '../components/ui/LoadingSkeleton'

type ItemType = 'replica' | 'creative' | 'product'
type FilterTab = 'all' | 'replica' | 'creative' | 'product'

interface BaseItem {
  id: string
  type: ItemType
  title: string
  created_at: string
}

interface ReplicaItem extends BaseItem {
  type: 'replica'
  video_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  duration?: number
}

interface CreativeItem extends BaseItem {
  type: 'creative'
  description: string
  style: string
  count: number
}

interface ProductItem extends BaseItem {
  type: 'product'
  product_id: string
  url: string
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
}

type WorkbenchItem = ReplicaItem | CreativeItem | ProductItem

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'replica', label: '爆款复刻' },
  { key: 'creative', label: '创意' },
  { key: 'product', label: '产品' },
]

function getItemIcon(type: ItemType) {
  switch (type) {
    case 'replica': return Film
    case 'creative': return Sparkles
    case 'product': return Package
  }
}

function getItemBgColor(type: ItemType) {
  switch (type) {
    case 'replica': return 'bg-blue-50'
    case 'creative': return 'bg-purple-50'
    case 'product': return 'bg-green-50'
  }
}

function getItemIconColor(type: ItemType) {
  switch (type) {
    case 'replica': return 'text-blue-500'
    case 'creative': return 'text-purple-500'
    case 'product': return 'text-green-500'
  }
}

function getItemTypeBadge(type: ItemType) {
  const badges = {
    replica: { label: '爆款复刻', class: 'bg-blue-100 text-blue-700' },
    creative: { label: '创意', class: 'bg-purple-100 text-purple-700' },
    product: { label: '产品', class: 'bg-green-100 text-green-700' },
  }
  const badge = badges[type]
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.class}`}>
      {badge.label}
    </span>
  )
}

function mapToStatusBadgeStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
  if (status === 'analyzing' || status === 'scraping') return 'processing'
  return status as 'pending' | 'processing' | 'completed' | 'failed'
}

export default function WorkbenchPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<WorkbenchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Fetch replica items
        const replicaRes = await axios.get('/api/reports')
        const replicaItems: ReplicaItem[] = replicaRes.data.map((item: any) => ({
          id: `replica-${item.video_id}`,
          type: 'replica' as const,
          video_id: item.video_id,
          title: item.filename,
          filename: item.filename,
          status: item.status,
          duration: item.duration,
          created_at: item.created_at,
        }))

        // TODO: Fetch creative items when API is ready
        const creativeItems: CreativeItem[] = []

        // TODO: Fetch product items when API is ready
        const productItems: ProductItem[] = []

        // Combine and sort by date
        const allItems = [...replicaItems, ...creativeItems, ...productItems]
        allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setItems(allItems)
      } catch (error) {
        console.error('Failed to fetch workbench data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  const handleItemClick = (item: WorkbenchItem) => {
    switch (item.type) {
      case 'replica':
        navigate(`/replica/${item.video_id}`)
        break
      case 'creative':
        // Navigate to creative page (could restore state if needed)
        navigate('/creative/new')
        break
      case 'product':
        navigate(`/product/${item.product_id}`)
        break
    }
  }

  const handleDelete = async (item: WorkbenchItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除该记录？此操作不可撤销。')) return

    try {
      switch (item.type) {
        case 'replica':
          await axios.delete(`/api/reports/${item.video_id}`)
          break
        case 'creative':
          // TODO: Implement creative delete API
          break
        case 'product':
          // TODO: Implement product delete API
          break
      }
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (error) {
      alert('删除失败，请重试')
    }
  }

  const filteredItems = items.filter(item => {
    // Filter by tab
    if (activeTab !== 'all' && item.type !== activeTab) return false

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return item.title.toLowerCase().includes(query)
    }

    return true
  })

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">工作台</h1>
          {!loading && items.length > 0 && (
            <span className="text-sm text-gray-400">{items.length} 条记录</span>
          )}
        </div>

        {/* Search and filter */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索记录..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all"
            />
          </div>

          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <ListSkeleton count={8} />
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              {items.length === 0 ? '暂无记录' : '没有匹配的记录'}
            </h3>
            <p className="text-sm text-gray-400">
              {items.length === 0
                ? '开始使用各项功能，记录会显示在这里'
                : '尝试调整搜索词或筛选条件'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map(item => {
              const Icon = getItemIcon(item.type)
              const bgColor = getItemBgColor(item.type)
              const iconColor = getItemIconColor(item.type)

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="group bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex justify-between items-center hover:border-blue-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        {getItemTypeBadge(item.type)}
                        <span className="text-sm font-medium text-gray-800 truncate">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.created_at).toLocaleString('zh-CN')}
                        </span>
                        {item.type === 'replica' && item.duration && (
                          <span>
                            {Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {(item.type === 'replica' || item.type === 'product') && 'status' in item && (
                      <StatusBadge status={mapToStatusBadgeStatus(item.status)} />
                    )}
                    <button
                      onClick={e => handleDelete(item, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150 cursor-pointer"
                      aria-label="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
