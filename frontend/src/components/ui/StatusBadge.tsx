import { Check, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { LucideIcon } from 'lucide-react'

type Status = 'pending' | 'processing' | 'completed' | 'failed'

interface StatusConfig {
  icon: LucideIcon
  label: string
  className: string
  animate?: boolean
}

const STATUS_CONFIG: Record<Status, StatusConfig> = {
  pending: {
    icon: Clock,
    label: '等待中',
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  processing: {
    icon: Loader2,
    label: '分析中',
    className: 'bg-blue-100 text-blue-700 border-blue-300',
    animate: true,
  },
  completed: {
    icon: Check,
    label: '已完成',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  failed: {
    icon: AlertCircle,
    label: '失败',
    className: 'bg-red-100 text-red-700 border-red-300',
  },
}

export function StatusBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
      text-xs font-medium border
      ${config.className}
      ${config.animate ? 'animate-pulse' : ''}
    `}>
      <Icon className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  )
}
