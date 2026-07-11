import { GitBranch, History, Info, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDate, stateLabel } from '../../api/format'
import type { WorkflowRevision, WorkflowView } from '../../api/types'

interface RevisionNode extends WorkflowRevision {
  children: RevisionNode[]
}

export function WorkflowHistoryGraph({
  history,
  allowRollback,
  busy,
  onRollback,
}: {
  history: WorkflowView['history']
  allowRollback: boolean
  busy: boolean
  onRollback: (revisionId: string) => void
}) {
  const [selectedId, setSelectedId] = useState(history.currentRevisionId)
  const { roots, byId } = useMemo(() => buildTree(history.revisions), [history.revisions])
  const selected = byId.get(selectedId) ?? byId.get(history.currentRevisionId)

  useEffect(() => {
    setSelectedId(history.currentRevisionId)
  }, [history.currentRevisionId])

  return (
    <section className="content-card history-card" aria-labelledby="history-title">
      <div className="history-heading">
        <div className="heading-group">
          <div className="icon-tile"><GitBranch size={18} aria-hidden="true" /></div>
          <div><p className="eyebrow">Reversible workflow</p><h2 id="history-title">Revision graph</h2></div>
        </div>
        <span>{history.revisions.length} revision{history.revisions.length === 1 ? '' : 's'}</span>
      </div>
      <p className="history-intro">Select a node to inspect it. Restoring creates a new branch and keeps the existing audit history.</p>
      <div className="revision-tree" role="tree" aria-label="Workflow revision graph">
        {roots.map((root) => (
          <RevisionBranch
            key={root.id}
            node={root}
            selectedId={selected?.id}
            byId={byId}
            onSelect={setSelectedId}
          />
        ))}
      </div>
      {selected && (
        <div className="revision-selection" aria-live="polite">
          <div>
            <span>Revision {selected.sequence} · {stateLabel(selected.state)} · {formatAction(selected.action)}</span>
            <strong>{selected.label}</strong>
            <small>{selected.summary}</small>
            <small>Captured {formatDate(selected.createdAt)}</small>
            {selected.decision && (
              <div className="revision-decision-context">
                <span>Decision context · {formatAction(selected.decision.kind)}</span>
                <strong>{selected.decision.title}</strong>
                {selected.decision.description && <p>{selected.decision.description}</p>}
                {(selected.decision.facts?.length ?? 0) > 0 && (
                  <dl className="revision-decision-facts">
                    {selected.decision.facts?.map((fact, index) => (
                      <div key={`${fact.label}-${index}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </div>
          {selected.isCurrent ? (
            <span className="current-revision-label"><History size={14} /> Current revision</span>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || !allowRollback || !selected.canRollback}
              onClick={() => onRollback(selected.id)}
            >
              <RotateCcw size={14} /> {busy ? 'Restoring…' : 'Restore this revision'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function RevisionBranch({
  node,
  selectedId,
  byId,
  onSelect,
}: {
  node: RevisionNode
  selectedId?: string
  byId: Map<string, RevisionNode>
  onSelect: (revisionId: string) => void
}) {
  const rollbackSource = node.rollbackFromRevisionId
    ? byId.get(node.rollbackFromRevisionId)
    : undefined
  const preview = node.decision?.title ?? node.summary
  return (
    <div className="revision-branch" role="treeitem" aria-expanded={node.children.length > 0 || undefined}>
      <button
        type="button"
        className={`revision-node ${node.isCurrent ? 'current' : ''} ${selectedId === node.id ? 'selected' : ''}`}
        aria-label={`Revision ${node.sequence}: ${node.label}. ${preview}. ${stateLabel(node.state)}. Captured ${formatDate(node.createdAt)}.${node.isCurrent ? ' Current revision.' : ''} View decision details.`}
        aria-pressed={selectedId === node.id}
        onClick={() => onSelect(node.id)}
      >
        <span className="revision-sequence">{node.sequence}</span>
        <span className="revision-node-copy">
          <span className="revision-node-title">
            <strong>{node.label}</strong>
            {node.isCurrent && <span className="revision-current-dot" aria-label="Current revision" />}
          </span>
          <span className="revision-node-summary">{preview}</span>
          <span className="revision-node-meta">
            <span>{stateLabel(node.state)}</span>
            <time dateTime={node.createdAt}>{formatNodeTime(node.createdAt)}</time>
            <span className="revision-detail-hint"><Info size={10} aria-hidden="true" /> Decision</span>
          </span>
        </span>
        {rollbackSource && <span className="revision-jump">↶ from {rollbackSource.sequence}</span>}
      </button>
      {node.children.length > 0 && (
        <div className="revision-children" role="group">
          {node.children.map((child) => (
            <RevisionBranch
              key={child.id}
              node={child}
              selectedId={selectedId}
              byId={byId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const nodeTime = new Intl.DateTimeFormat('en-PL', {
  hour: '2-digit',
  minute: '2-digit',
})

const formatNodeTime = (value: string) => nodeTime.format(new Date(value))
const formatAction = (action: string) => action.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function buildTree(revisions: WorkflowRevision[]) {
  const byId = new Map<string, RevisionNode>()
  revisions.forEach((revision) => byId.set(revision.id, { ...revision, children: [] }))
  const roots: RevisionNode[] = []
  revisions.forEach((revision) => {
    const node = byId.get(revision.id)!
    const parent = revision.parentRevisionId ? byId.get(revision.parentRevisionId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  const bySequence = (a: RevisionNode, b: RevisionNode) => a.sequence - b.sequence
  byId.forEach((node) => node.children.sort(bySequence))
  roots.sort(bySequence)
  return { roots, byId }
}
