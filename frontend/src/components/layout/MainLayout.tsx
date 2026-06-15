import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#faf9f7' }}>
      <Sidebar />
      <main className="flex-1 ml-60 min-w-0">
        {children}
      </main>
    </div>
  )
}
