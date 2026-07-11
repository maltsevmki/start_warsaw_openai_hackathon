import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { MessageSquareText, Plus, RefreshCw, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { workflowKeys } from '../api/query-keys'
import { getWorkflows, resetWorkspace } from '../api/workflow-api'
import ConfirmDialog from './ConfirmDialog'

const stateLabels: Record<string, string> = {
  needs_clarification: 'Needs your reply',
  awaiting_alternative_acceptance: 'Choose a tradeoff',
  awaiting_approval: 'Awaiting approval',
  checkout_failed: 'Checkout stopped',
  blocked_by_policy: 'Blocked safely',
  tracking: 'Tracking order',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Declined',
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(delta / 60_000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 7 ? `${days}d` : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

export default function WorkflowSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: workflowKeys.list(), queryFn: ({ signal }) => getWorkflows(signal) })
  const clearHistory = useMutation({
    mutationFn: resetWorkspace,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: workflowKeys.all })
      queryClient.setQueryData(workflowKeys.list(), { workflows: [] })
      setConfirmClear(false)
    },
  })
  const visibleWorkflows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (query.data?.workflows ?? []).filter((workflow) => !term || workflow.prompt.toLocaleLowerCase().includes(term))
  }, [query.data, search])

  return (
    <>
      {open && <button className="history-backdrop" aria-label="Close workflow history" onClick={onClose} />}
      <aside className={`workflow-sidebar ${open ? 'open' : ''}`} aria-label="Workflow history">
        <div className="sidebar-heading">
          <Link to="/" className="sidebar-brand" onClick={onClose}><span><ShoppingBag size={17} /></span><div><strong>ClearCart</strong><small>Agent workspace</small></div></Link>
          <button className="sidebar-close" onClick={onClose} aria-label="Close workflow history"><X size={18} /></button>
        </div>
        <Link to="/" className="new-workflow-button" onClick={onClose}><Plus size={17} /> New workflow <kbd>⌘ K</kbd></Link>
        <label className="sidebar-search"><Search size={15} /><span className="sr-only">Search workflows</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workflows" /></label>
        <div className="sidebar-label"><span>Recent</span>{query.data?.workflows.length ? <small>{query.data.workflows.length}</small> : null}</div>
        <nav className="workflow-list" aria-label="Recent workflows">
          {query.isPending && <div className="sidebar-state"><span className="mini-spinner dark" /> Loading history…</div>}
          {query.isError && <button className="sidebar-state retry" onClick={() => query.refetch()}><RefreshCw size={14} /> Try loading again</button>}
          {query.data?.workflows.length === 0 && (
            <div className="sidebar-empty"><MessageSquareText size={21} /><strong>No workflows yet</strong><span>Your agent chats will appear here.</span></div>
          )}
          {Boolean(query.data?.workflows.length) && visibleWorkflows.length === 0 ? <div className="sidebar-empty compact"><Search size={19} /><strong>No matches</strong><span>Try a different search.</span></div> : null}
          {visibleWorkflows.map((workflow) => {
            const href = `/workflows/${workflow.id}`
            const active = pathname === href
            return (
              <Link key={workflow.id} to="/workflows/$workflowId" params={{ workflowId: workflow.id }} className={`workflow-list-item ${active ? 'active' : ''}`} onClick={onClose}>
                <span className="workflow-item-icon"><MessageSquareText size={15} /></span>
                <span className="workflow-item-copy"><strong>{workflow.prompt}</strong><small><i className={`state-dot state-${workflow.state}`} />{stateLabels[workflow.state] ?? workflow.state.replaceAll('_', ' ')} · {relativeTime(workflow.updatedAt)}</small></span>
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => setConfirmClear(true)} disabled={!query.data?.workflows.length}><Trash2 size={15} /><span>Clear history</span></button>
          <p>Demo workspace · Stored for this session</p>
        </div>
      </aside>
      {confirmClear && <ConfirmDialog title="Clear workflow history?" description="This removes all saved workflows from the demo workspace. This action cannot be undone." confirmLabel="Clear history" busy={clearHistory.isPending} onConfirm={() => clearHistory.mutate()} onClose={() => setConfirmClear(false)} />}
    </>
  )
}
