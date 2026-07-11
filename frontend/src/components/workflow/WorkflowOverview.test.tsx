// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComparisonResult } from '../../api/types'
import { ComparisonSection } from './WorkflowOverview'

afterEach(cleanup)

const comparison = {
  id: 'cmp_test',
  bestOfferId: 'offer_1',
  confidence: 0.92,
  recommendation: 'proceed',
  summary: 'Three viable offers were compared.',
  rankedOffers: [
    { offerId: 'offer_1', rank: 1, score: 9.4, title: 'Monitor One', total: { amount: 899, currency: 'PLN' }, reasons: ['Best return terms'], tradeoffs: [], disqualifiers: [] },
    { offerId: 'offer_2', rank: 2, score: 8.8, title: 'Monitor Two', total: { amount: 829, currency: 'PLN' }, reasons: ['Lower price'], tradeoffs: ['Shorter warranty'], disqualifiers: [] },
    { offerId: 'offer_3', rank: 3, score: 8.1, title: 'Monitor Three', total: { amount: 949, currency: 'PLN' }, reasons: ['Fast delivery'], tradeoffs: [], disqualifiers: [] },
  ],
  missingEvidence: [],
} satisfies ComparisonResult

describe('ComparisonSection', () => {
  it('shows top choices without exposing internal scores', () => {
    render(<ComparisonSection comparison={comparison} selectedOfferId="offer_1" canSelect onSelect={vi.fn()} />)
    expect(screen.queryByText(/score/i)).toBeNull()
    expect(screen.getByText('Your choice')).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('lets the user select another ranked offer', () => {
    const onSelect = vi.fn()
    render(<ComparisonSection comparison={comparison} selectedOfferId="offer_1" canSelect onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose' })[0])
    expect(onSelect).toHaveBeenCalledWith('offer_2')
  })
})
