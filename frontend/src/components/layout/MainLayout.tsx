import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { HistorySidebar } from './HistorySidebar'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-52 min-w-0">
        {children}
      </main>
      <HistorySidebar />
    </div>
  )
}
