// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowView } from '../api/types'
import { AUTO_MODE_STORAGE_KEY, autoModeCheckoutUrl } from '../features/auto-mode'
import AutoModeToggle from './AutoModeToggle'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

describe('AutoModeToggle', () => {
  it('persists the navbar auto-mode preference', () => {
    render(<AutoModeToggle />)
    const toggle = screen.getByRole('switch', { name: /auto mode/i })

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem(AUTO_MODE_STORAGE_KEY)).toBe('enabled')
  })

  it('hands an awaiting proposal off only to an HTTP merchant URL', () => {
    const view = {
      workflow: { state: 'awaiting_approval' },
      proposal: { checkoutUrl: 'https://merchant.example/product' },
    } as unknown as WorkflowView

    expect(autoModeCheckoutUrl(view)).toBe('https://merchant.example/product')
    view.proposal!.checkoutUrl = 'javascript:alert(1)'
    expect(autoModeCheckoutUrl(view)).toBeNull()
  })
})
