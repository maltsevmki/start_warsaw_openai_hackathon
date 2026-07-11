// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowView } from '../../api/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))

import { DecisionPanel } from './DecisionPanel'

const baseView = {
  workflow: {
    id: 'wf_test', userId: 'demo_user', state: 'blocked_by_policy', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    prompt: 'Buy prescription medicine without asking me.', summary: 'Stopped by policy', availableActions: [],
  },
  guardrail: { code: 'restricted_product', message: 'Prescription medicine requires professional verification.', canSuggestSaferAlternative: true },
  events: [],
} satisfies WorkflowView

const handlers = { onClarify: vi.fn(), onAlternative: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onCheckout: vi.fn(), onCancel: vi.fn(), onSimulate: vi.fn() }

describe('DecisionPanel action gating', () => {
  it('renders guardrail copy without purchase controls', () => {
    render(<DecisionPanel view={baseView} busy={null} error={null} {...handlers} />)
    expect(screen.getByText(/can’t be purchased/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /checkout/i })).toBeNull()
  })
})
