// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComparisonResult, WorkflowView } from '../../api/types'
import { ComparisonSection, PurchaseControlPanel } from './WorkflowOverview'

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

describe('PurchaseControlPanel', () => {
  it('turns canonical proposal and comparison data into client-facing guidance', () => {
    const view = {
      workflow: {
        id: 'wf_test', userId: 'demo_user', state: 'awaiting_approval', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        prompt: 'Find a monitor', summary: 'Review the proposal', availableActions: ['approve_proposal'],
      },
      history: {
        currentRevisionId: 'rev_1',
        revisions: [{ id: 'rev_1', workflowId: 'wf_test', sequence: 1, state: 'awaiting_approval', action: 'proposal_created', label: 'Proposal ready', summary: 'Review the proposal', createdAt: '2026-01-01T00:00:00Z', isCurrent: true, canRollback: false }],
      },
      comparison,
      proposal: {
        id: 'prop_1', workflowId: 'wf_test', version: 1, status: 'created', offerId: 'offer_2', merchantName: 'Merchant', title: 'Monitor Two', quantity: 1,
        lineItems: [], subtotal: { amount: 850, currency: 'PLN' }, taxesAndFees: { amount: 49, currency: 'PLN' }, total: { amount: 899, currency: 'PLN' },
        delivery: { label: 'Arrives tomorrow', earliest: '2026-01-02', latest: '2026-01-02' }, returns: { returnable: true, days: 30, label: '30-day returns' },
        warranty: { months: 24, label: '2-year warranty' }, paymentMethodLabel: 'Card ending 4242', approvalText: 'Approve', expiresAt: '2026-01-01T01:00:00Z', hash: 'sha256:test',
      },
      events: [],
    } as WorkflowView

    render(<PurchaseControlPanel view={view} />)
    expect(screen.getByText('Purchase control')).toBeTruthy()
    expect(screen.getByText('Review the exact terms')).toBeTruthy()
    expect(screen.getByText('Shorter warranty')).toBeTruthy()
    expect(screen.getByText('What you need to do')).toBeTruthy()
    expect(screen.getByText(/review the exact terms, then approve or decline/i)).toBeTruthy()
    expect(screen.queryByText('Audit trail')).toBeNull()
  })
})
