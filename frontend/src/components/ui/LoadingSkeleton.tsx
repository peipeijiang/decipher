export function VideoSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="bg-gray-200 h-80 rounded-2xl" />
      <div className="bg-gray-200 h-10 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-200 h-28 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-gray-100 border border-gray-200 h-[68px] rounded-xl animate-pulse" />
      ))}
    </div>
  )
}
