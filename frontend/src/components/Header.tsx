import { Link } from '@tanstack/react-router'
import { LockKeyhole, Menu, ShoppingBag } from 'lucide-react'
import AutoModeToggle from './AutoModeToggle'
import ThemeToggle from './ThemeToggle'

export default function Header({ onOpenHistory }: { onOpenHistory: () => void }) {
  return (
    <header className="site-header">
      <nav className="page-width">
        <button className="history-menu-button" onClick={onOpenHistory} aria-label="Open workflow history"><Menu size={19} /></button>
        <Link to="/" className="brand header-brand" aria-label="ClearCart home"><span><ShoppingBag size={18} /></span><div><strong>ClearCart</strong><small>Calm commerce</small></div></Link>
        <div className="header-trust"><LockKeyhole size={14} /> You approve every purchase</div>
        <AutoModeToggle />
        <ThemeToggle />
      </nav>
    </header>
  )
}
