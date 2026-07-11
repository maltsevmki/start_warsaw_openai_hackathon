import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    setMode(getInitialMode())
  }, [])

  function setTheme(nextMode: ThemeMode) {
    setMode(nextMode)
    applyThemeMode(nextMode)
    window.localStorage.setItem('theme', nextMode)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(mode === 'light' ? 'dark' : 'light')}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} theme`}
      title={`Switch to ${mode === 'light' ? 'dark' : 'light'} theme`}
    >
      <span className="theme-toggle-icon">{mode === 'light' ? <Sun size={16} /> : <Moon size={16} />}</span>
      <span className="theme-toggle-copy"><small>Appearance</small><strong>{mode === 'light' ? 'Light' : 'Dark'}</strong></span>
      <span className="theme-toggle-track" aria-hidden="true"><span /></span>
    </button>
  )
}
