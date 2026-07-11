// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openExternalInNewTab } from './external-navigation'

afterEach(() => vi.restoreAllMocks())

describe('external navigation', () => {
  it('opens merchant URLs in an isolated new tab', () => {
    const popup = { opener: window } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(popup)

    expect(openExternalInNewTab('https://merchant.example/checkout')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://merchant.example/checkout', '_blank', 'noopener,noreferrer')
    expect(popup.opener).toBeNull()
  })
})
