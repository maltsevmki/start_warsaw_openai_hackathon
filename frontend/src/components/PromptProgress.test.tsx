// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PromptProgress from './PromptProgress'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PromptProgress', () => {
  it('advances through readable agent activity states', () => {
    vi.useFakeTimers()
    render(<PromptProgress prompt="Find a monitor" />)

    expect(screen.getByText('Understanding your request').closest('li')?.className).toBe('active')
    act(() => vi.advanceTimersByTime(1200))
    expect(screen.getByText('Planning the search').closest('li')?.className).toBe('active')
    expect(screen.getByText('Understanding your request').closest('li')?.className).toBe('complete')
  })
})
