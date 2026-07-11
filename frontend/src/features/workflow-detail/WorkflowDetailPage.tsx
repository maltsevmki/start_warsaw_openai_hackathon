import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { workflowKeys } from '../../api/query-keys'
import type { ClarificationReply, OrderStatus, WorkflowView } from '../../api/types'
import {
  addWorkflowMessage,
  approveProposal,
  cancelWorkflow,
  getWorkflow,
  rejectProposal,
  rollbackWorkflow,
  respondToAlternative,
  selectOffer,
  simulateOrderStatus,
} from '../../api/workflow-api'
import { DecisionPanel } from '../../components/workflow/DecisionPanel'
import { WorkflowHistoryGraph } from '../../components/workflow/WorkflowHistoryGraph'
import Toast, { type ToastMessage } from '../../components/Toast'
import { autoModeCheckoutUrl, isAutoModeEnabled } from '../auto-mode'
import { openExternalInCurrentTab } from '../external-navigation'
import {
  ComparisonSection,
  PurchaseControlPanel,
  RequestSummary,
  WorkflowHeader,
} from '../../components/workflow/WorkflowOverview'

type Operation = { name: string; run: () => Promise<WorkflowView>; redirectAfterApproval?: boolean }

function successMessage(operation: string, view: WorkflowView): ToastMessage {
  if (operation === 'clarify') return { id: Date.now(), text: 'Details saved. Research continued.' }
  if (operation === 'alternative') return { id: Date.now(), text: 'Your constraint choice was applied.' }
  if (operation === 'approve') return { id: Date.now(), text: 'Approval recorded. Checkout has not run yet.' }
  if (operation === 'reject') return { id: Date.now(), text: 'Proposal declined.' }
  if (operation === 'checkout') return view.workflow.state === 'checkout_failed'
    ? { id: Date.now(), text: 'Checkout stopped safely.', tone: 'info' }
    : { id: Date.now(), text: 'Checkout completed and order created.' }
  if (operation === 'cancel') return { id: Date.now(), text: 'Workflow cancelled.', tone: 'info' }
  if (operation === 'rollback') return { id: Date.now(), text: 'Earlier choice restored.' }
  if (operation.startsWith('select-offer:')) return { id: Date.now(), text: 'Selected offer updated.' }
  if (operation.startsWith('tracking-')) return { id: Date.now(), text: 'Tracking status updated.' }
  return { id: Date.now(), text: 'Workflow updated.' }
}

export function WorkflowDetailPage({
  workflowId,
  initialData,
}: {
  workflowId: string
  initialData: WorkflowView
}) {
  const queryClient = useQueryClient()
  const [announcement, setAnnouncement] = useState('')
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const openedCheckoutUrl = useRef<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const query = useQuery({
    queryKey: workflowKeys.detail(workflowId),
    queryFn: ({ signal }) => getWorkflow(workflowId, signal),
    initialData,
  })
  const mutation = useMutation({
    mutationFn: (operation: Operation) => operation.run(),
    onSuccess: (view, operation) => {
      queryClient.setQueryData(workflowKeys.detail(workflowId), view)
      queryClient.setQueryData(workflowKeys.events(workflowId), view.events)
      queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
      setAnnouncement(view.workflow.summary)
      setToast(successMessage(operation.name, view))
      if (isAutoModeEnabled() || operation.redirectAfterApproval) {
        const checkoutUrl = autoModeCheckoutUrl(view)
        if (checkoutUrl && typeof window !== 'undefined') {
          openExternalInCurrentTab(checkoutUrl)
          openedCheckoutUrl.current = checkoutUrl
        }
      }
    },
    onError: (error) => setToast({ id: Date.now(), text: error.message, tone: 'error' }),
  })

  useEffect(() => {
    if (!query.data || !isAutoModeEnabled()) return
    const checkoutUrl = autoModeCheckoutUrl(query.data)
    if (checkoutUrl && checkoutUrl !== openedCheckoutUrl.current) {
      openExternalInCurrentTab(checkoutUrl)
      openedCheckoutUrl.current = checkoutUrl
    }
  }, [query.data])

  if (query.isPending) return <PageLoading />
  if (query.isError) return <PageError error={query.error} onRetry={() => query.refetch()} />

  const view = query.data
  const run = (name: string, operation: () => Promise<WorkflowView>, redirectAfterApproval = false) => {
    setAnnouncement('')
    setToast(null)
    mutation.mutate({ name, run: operation, redirectAfterApproval })
  }
  const message = mutation.error instanceof Error ? mutation.error.message : null
  const busy = mutation.isPending ? mutation.variables.name : null
  const canSelectOffer = view.workflow.availableActions.includes('select_offer')
  const showComparison = view.workflow.state === 'awaiting_approval' && !view.approval

  return (
    <main className="workflow-page">
      <div className="page-width workflow-stack">
        <WorkflowHeader workflow={view.workflow} />
        <WorkflowHistoryGraph
          history={view.history}
          allowRollback={view.workflow.availableActions.includes('rollback')}
          busy={busy === 'rollback'}
          onRollback={(revisionId) => run('rollback', () => rollbackWorkflow(workflowId, revisionId))}
        />
        <div className="workflow-layout">
          <div className="workflow-main">
            <DecisionPanel
              view={view}
              busy={busy}
              error={message}
              onClarify={(reply: ClarificationReply) => run('clarify', () => addWorkflowMessage(workflowId, reply))}
              onAlternative={(accepted, alternativeId) => run('alternative', () => respondToAlternative(workflowId, { accepted, ...(alternativeId ? { alternativeId } : {}) }))}
              onApprove={() => {
                if (!view.proposal) return
                run('approve', () => approveProposal(workflowId, { proposalId: view.proposal!.id, proposalVersion: view.proposal!.version, proposalHash: view.proposal!.hash, approved: true }), isAutoModeEnabled())
              }}
              onReject={(reason) => {
                if (!view.proposal) return
                run('reject', () => rejectProposal(workflowId, { proposalId: view.proposal!.id, reason }))
              }}
              onCancel={() => run('cancel', () => cancelWorkflow(workflowId))}
              onSimulate={(status: OrderStatus) => {
                if (!view.order) return
                run(`tracking-${status}`, () => simulateOrderStatus(view.order!.id, status))
              }}
            />
            {mutation.error instanceof ApiError && mutation.error.kind === 'conflict' && (
              <button className="refresh-conflict" onClick={() => query.refetch()}>Refresh workflow to see the latest state</button>
            )}
            <RequestSummary prompt={view.workflow.prompt} constraints={view.constraints} />
            {showComparison && (
              <ComparisonSection
                comparison={view.comparison}
                selectedOfferId={view.proposal?.offerId}
                canSelect={canSelectOffer}
                selectingOfferId={busy?.startsWith('select-offer:') ? busy.slice('select-offer:'.length) : undefined}
                onSelect={(offerId) => run(`select-offer:${offerId}`, () => selectOffer(workflowId, offerId))}
              />
            )}
          </div>
          <PurchaseControlPanel view={view} />
        </div>
      </div>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <Toast message={toast} onDismiss={dismissToast} />
    </main>
  )
}

function PageLoading() {
  return <main className="center-state"><div><span className="loading-orbit" /><h1>Restoring workflow…</h1><p>Fetching the canonical state and audit record.</p></div></main>
}

function PageError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return <main className="center-state"><div><h1>Couldn’t load this workflow</h1><p>{error.message}</p><button className="button button-primary" onClick={onRetry}>Try again</button></div></main>
}
