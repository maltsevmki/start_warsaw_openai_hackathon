// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowView } from '../../api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

import { DecisionPanel } from './DecisionPanel'

afterEach(cleanup)

const baseView = {
  workflow: {
    id: 'wf_test', userId: 'demo_user', state: 'blocked_by_policy', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    prompt: 'Buy prescription medicine without asking me.', summary: 'Stopped by policy', availableActions: [],
  },
  guardrail: { code: 'restricted_product', message: 'Prescription medicine requires professional verification.', canSuggestSaferAlternative: true },
  events: [],
  history: {
    currentRevisionId: 'rev_1',
    revisions: [{
      id: 'rev_1', workflowId: 'wf_test', sequence: 1, state: 'blocked_by_policy', action: 'workflow_started',
      label: 'Request processed', summary: 'Stopped by policy', createdAt: '2026-01-01T00:00:00Z', isCurrent: true, canRollback: false,
    }],
  },
} satisfies WorkflowView

const handlers = { onClarify: vi.fn(), onAlternative: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onCheckout: vi.fn(), onCancel: vi.fn(), onSimulate: vi.fn() }

describe('DecisionPanel action gating', () => {
  it('renders guardrail copy without purchase controls', () => {
    render(<DecisionPanel view={baseView} busy={null} error={null} {...handlers} />)
    expect(screen.getByText(/can’t be purchased/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /checkout/i })).toBeNull()
  })

  it('asks for a decline reason only after the user chooses to decline', () => {
    const onReject = vi.fn()
    const proposalView = {
      workflow: { ...baseView.workflow, state: 'awaiting_approval', summary: 'Review proposal', availableActions: ['approve_proposal', 'reject_proposal', 'cancel'] },
      proposal: {
        id: 'prop_1', workflowId: 'wf_test', version: 1, status: 'created', offerId: 'offer_1', merchantName: 'Merchant', title: 'Monitor', quantity: 1,
        lineItems: [], subtotal: { amount: 900, currency: 'PLN' }, taxesAndFees: { amount: 99, currency: 'PLN' }, total: { amount: 999, currency: 'PLN' },
        delivery: { label: 'Tomorrow', earliest: '2026-01-02', latest: '2026-01-02' }, returns: { returnable: true, days: 30, label: '30-day returns' },
        warranty: { months: 24, label: '2-year warranty' }, paymentMethodLabel: 'Card', approvalText: 'Approve these exact terms', expiresAt: '2026-01-01T01:00:00Z', hash: 'sha256:test',
      },
      events: [],
      history: baseView.history,
    } as unknown as WorkflowView

    render(<DecisionPanel view={proposalView} busy={null} error={null} {...handlers} onReject={onReject} />)
    expect(screen.queryByLabelText(/reason/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Decline proposal' }))
    const reason = screen.getByLabelText(/reason/i)
    fireEvent.change(reason, { target: { value: 'Prefer another merchant' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }))
    expect(onReject).toHaveBeenCalledWith('Prefer another merchant')
  })

})
