import { describe, expect, it } from 'vitest'
import { formatMoney, stateLabel, titleCase } from './format'

describe('workflow formatters', () => {
  it('formats PLN using the en-PL locale', () => {
    expect(formatMoney({ amount: 999, currency: 'PLN' })).toContain('999')
    expect(formatMoney({ amount: 999, currency: 'PLN' })).toContain('PLN')
  })

  it('uses human consent-oriented state labels', () => {
    expect(stateLabel('awaiting_approval')).toBe('Your approval needed')
    expect(stateLabel('checkout_failed')).toBe('Checkout stopped')
  })

  it('turns API identifiers into readable labels', () => {
    expect(titleCase('out_for_delivery')).toBe('Out For Delivery')
  })
})
