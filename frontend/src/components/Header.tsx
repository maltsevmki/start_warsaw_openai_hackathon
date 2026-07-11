import { Link } from '@tanstack/react-router'
import { LockKeyhole, ShoppingBag } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="site-header">
      <nav className="page-width">
        <Link to="/" className="brand"><span><ShoppingBag size={19} /></span><strong>ClearCart</strong><small>agent commerce</small></Link>
        <div className="header-trust"><LockKeyhole size={14} /> No purchase without approval</div>
        <ThemeToggle />
      </nav>
    </header>
  )
}
