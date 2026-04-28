import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Sidebar />
      <main className="flex-1 ml-20">
        {children}
      </main>
    </div>
  )
}
