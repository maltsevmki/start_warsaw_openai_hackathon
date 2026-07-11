// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowView } from '../../api/types'
import { WorkflowHistoryGraph } from './WorkflowHistoryGraph'

const history: WorkflowView['history'] = {
  currentRevisionId: 'rev_3',
  revisions: [
    { id: 'rev_1', workflowId: 'wf_1', sequence: 1, state: 'needs_clarification', action: 'workflow_started', label: 'Request processed', summary: 'Need a detail', createdAt: '2026-01-01T00:00:00Z', isCurrent: false, canRollback: true },
    { id: 'rev_2', workflowId: 'wf_1', parentRevisionId: 'rev_1', sequence: 2, state: 'awaiting_approval', action: 'clarification_answered', label: 'Clarification answered', summary: 'Review terms', createdAt: '2026-01-01T00:01:00Z', isCurrent: false, canRollback: true },
    { id: 'rev_3', workflowId: 'wf_1', parentRevisionId: 'rev_1', rollbackFromRevisionId: 'rev_2', sequence: 3, state: 'needs_clarification', action: 'rollback', label: 'Restored revision 1', summary: 'Restored', createdAt: '2026-01-01T00:02:00Z', isCurrent: true, canRollback: false },
  ],
}

describe('WorkflowHistoryGraph', () => {
  it('lets a user select a prior node and request restoration', () => {
    const onRollback = vi.fn()
    render(<WorkflowHistoryGraph history={history} allowRollback busy={false} onRollback={onRollback} />)

    fireEvent.click(screen.getByRole('button', { name: /clarification answered/i }))
    fireEvent.click(screen.getByRole('button', { name: /restore this revision/i }))

    expect(onRollback).toHaveBeenCalledWith('rev_2')
    expect(screen.getByText('↶ from 2')).toBeTruthy()
  })
})
