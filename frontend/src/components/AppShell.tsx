import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import Footer from './Footer'
import Header from './Header'
import WorkflowSidebar from './WorkflowSidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setHistoryOpen(false)
        navigate({ to: '/' })
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [navigate])
  return (
    <div className="app-shell">
      <WorkflowSidebar open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <div className="app-content">
        <Header onOpenHistory={() => setHistoryOpen(true)} />
        {children}
        <Footer />
      </div>
    </div>
  )
}
