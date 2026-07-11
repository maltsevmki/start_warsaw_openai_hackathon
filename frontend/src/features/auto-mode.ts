import type { WorkflowView } from '../api/types'

export const AUTO_MODE_STORAGE_KEY = 'clearcart:auto-mode'

export function isAutoModeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AUTO_MODE_STORAGE_KEY) === 'enabled'
}

export function setAutoModeEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTO_MODE_STORAGE_KEY, enabled ? 'enabled' : 'disabled')
}

export function autoModeCheckoutUrl(view: WorkflowView): string | null {
  if (view.workflow.state !== 'awaiting_approval' || !view.proposal) return null
  const candidate = view.proposal.checkoutUrl ?? view.proposal.productUrl
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
