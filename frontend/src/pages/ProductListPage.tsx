import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Package,
  Loader2,
  Trash2,
  AlertCircle,
  Plus,
  Image as ImageIcon,
  FileText,
  Inbox,
} from 'lucide-react'
import { MainLayout } from '../components/layout/MainLayout'
import { getProducts, deleteProduct, getProductImageUrl } from '../api/client'
import type { Product } from '../types/product'

// ─── helpers ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'completed' | 'analyzing' | 'failed'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'completed', label: '已完成' },
  { key: 'analyzing', label: '分析中' },
  { key: 'failed', label: '失败' },
]

function matchesFilter(product: Product, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'completed') return product.status === 'completed'
  if (tab === 'analyzing') return product.status === 'analyzing' || product.status === 'scraping' || product.status === 'pending'
  if (tab === 'failed') return product.status === 'failed'
  return true
}

function matchesSearch(product: Product, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    product.title.toLowerCase().includes(q) ||
    product.url.toLowerCase().includes(q)
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── status badge ────────────────────────────────────────────────────────────

function ProductStatusBadge({ status }: { status: Product['status'] }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
        已完成
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
        失败
      </span>
    )
  }
  if (status === 'analyzing' || status === 'scraping') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        分析中
      </span>
    )
  }
  // pending
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
      等待中
    </span>
  )
}

// ─── thumbnail area ──────────────────────────────────────────────────────────

interface ThumbnailAreaProps {
  product: Product
  imageFilenames: string[]
}

function ThumbnailArea({ product, imageFilenames }: ThumbnailAreaProps) {
  const bgClass =
    product.status === 'failed'
      ? 'bg-gradient-to-br from-red-50 to-red-100'
      : product.status === 'analyzing' || product.status === 'scraping'
      ? 'bg-gradient-to-br from-blue-50 to-blue-100'
      : 'bg-gradient-to-br from-sky-50 to-blue-100'

  if (product.status === 'failed') {
    return (
      <div className={`h-36 ${bgClass} flex flex-col items-center justify-center gap-1`}>
        <AlertCircle className="w-8 h-8 text-red-300" />
        <span className="text-xs text-red-400">抓取失败</span>
      </div>
    )
  }

  if (imageFilenames.length === 0) {
    return (
      <div className={`h-36 ${bgClass} flex flex-col items-center justify-center gap-1`}>
        <ImageIcon className="w-8 h-8 text-gray-300" />
        <span className="text-xs text-gray-400">暂无图片</span>
      </div>
    )
  }

  const shown = imageFilenames.slice(0, 2)
  const extra = imageFilenames.length - 2

  return (
    <div className={`h-36 ${bgClass} flex items-center justify-center gap-2 px-3`}>
      {shown.map((filename) => (
        <img
          key={filename}
          src={getProductImageUrl(product.id, filename)}
          alt=""
          className="w-16 h-16 object-cover rounded-lg bg-gray-200 flex-shrink-0"
          onError={(e) => {
            const target = e.currentTarget
            target.style.display = 'none'
          }}
        />
      ))}
      {extra > 0 && (
        <div className="w-16 h-16 rounded-lg bg-white/60 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
          +{extra}
        </div>
      )}
    </div>
  )
}

// ─── product card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product
  imageFilenames: string[]
  promptCount: number
  onDelete: (id: string) => void
  onRetry: (id: string) => void
}

function ProductCard({ product, imageFilenames, promptCount, onDelete, onRetry }: ProductCardProps) {
  const navigate = useNavigate()

  const borderClass =
    product.status === 'failed'
      ? 'border-red-200'
      : product.status === 'analyzing' || product.status === 'scraping'
      ? 'border-blue-200'
      : 'border-gray-200'

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除该产品？此操作不可撤销。')) return
    onDelete(product.id)
  }

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRetry(product.id)
  }

  const displayTitle = product.title || 'Untitled Product'
  const isAnalyzing = product.status === 'analyzing' || product.status === 'scraping' || product.status === 'pending'

  return (
    <div
      onClick={() => navigate(`/product/${product.id}`)}
      className={`border ${borderClass} rounded-xl overflow-hidden bg-white cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
    >
      <ThumbnailArea product={product} imageFilenames={imageFilenames} />

      <div className="p-3.5">
        {/* title + badge */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <span className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 flex-1 min-w-0">
            {displayTitle}
          </span>
          <ProductStatusBadge status={product.status} />
        </div>

        {/* URL */}
        <div className="text-[11px] text-gray-400 truncate mb-2">{product.url}</div>

        {/* error message */}
        {product.status === 'failed' && product.error_message && (
          <div className="text-[11px] text-red-500 mb-2 line-clamp-2">
            {product.error_message}
          </div>
        )}

        {/* stats */}
        {product.status !== 'failed' && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-2">
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {imageFilenames.length} 张图
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {isAnalyzing ? '生成中...' : `${promptCount} 个提示词`}
            </span>
          </div>
        )}

        {/* progress bar for analyzing */}
        {isAnalyzing && (
          <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-blue-400 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        {/* footer: date + actions */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100">
          <span className="text-[10px] text-gray-400">{formatDate(product.created_at)}</span>
          <div className="flex items-center gap-1.5">
            {product.status === 'failed' && (
              <button
                onClick={handleRetry}
                className="px-2 py-1 text-[10px] border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                重试
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
              aria-label="删除产品"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

// The API returns Product[] without image filenames or prompt counts embedded.
// We derive image filenames from ProductDoc when available, but for the list
// view we just show placeholder counts based on what the API gives us.
// The Product type doesn't carry image/prompt counts directly, so we show
// sensible defaults and let the detail page show full data.

export default function ProductListPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchProducts = useCallback(async () => {
    try {
      setError(null)
      const data = await getProducts()
      setProducts(data)
    } catch {
      setError('加载产品列表失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteProduct(id)
      setProducts(prev => prev.filter(p => p.id !== id))
    } catch {
      alert('删除失败，请重试')
    }
  }, [])

  const handleRetry = useCallback((id: string) => {
    navigate(`/product/${id}`)
  }, [navigate])

  const filtered = products.filter(
    p => matchesFilter(p, activeTab) && matchesSearch(p, debouncedQuery)
  )

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-16">
        {/* page header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">产品历史</h1>
          {!loading && products.length > 0 && (
            <span className="text-sm text-gray-400">{products.length} 个产品</span>
          )}
        </div>

        {/* top bar: search + filter tabs + new button */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索产品名称或网址..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent transition-all"
            />
          </div>

          {/* filter tabs */}
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

          {/* new product button */}
          <button
            onClick={() => navigate('/product')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            新建产品
          </button>
        </div>

        {/* content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchProducts}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors cursor-pointer"
            >
              重新加载
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              {products.length === 0 ? (
                <Package className="w-8 h-8 text-gray-400" />
              ) : (
                <Inbox className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              {products.length === 0 ? '还没有产品' : '没有匹配的产品'}
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              {products.length === 0
                ? '输入产品网址开始第一次分析'
                : '尝试调整搜索词或筛选条件'}
            </p>
            {products.length === 0 && (
              <button
                onClick={() => navigate('/product')}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新建产品
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                imageFilenames={[]}
                promptCount={0}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
