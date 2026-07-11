import { Link } from '@tanstack/react-router'
import { LockKeyhole, ShoppingBag } from 'lucide-react'
import AutoModeToggle from './AutoModeToggle'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="site-header">
      <nav className="page-width">
        <Link to="/" className="brand" aria-label="ClearCart home"><span><ShoppingBag size={18} /></span><div><strong>ClearCart</strong><small>Calm commerce</small></div></Link>
        <div className="header-trust"><LockKeyhole size={14} /> You approve every purchase</div>
        <AutoModeToggle />
        <ThemeToggle />
      </nav>
    </header>
  )
}
