import { Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isAutoModeEnabled, setAutoModeEnabled } from '../features/auto-mode'

export default function AutoModeToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => setEnabled(isAutoModeEnabled()), [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setAutoModeEnabled(next)
  }

  return (
    <button
      type="button"
      className={`auto-mode-toggle${enabled ? ' enabled' : ''}`}
      role="switch"
      aria-checked={enabled}
      onClick={toggle}
      title="When enabled, the best result immediately opens on the verified merchant site"
    >
      <Zap size={14} aria-hidden="true" />
      <span>Auto mode</span>
      <i aria-hidden="true" />
    </button>
  )
}
