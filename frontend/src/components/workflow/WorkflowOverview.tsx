import {
  Check,
  CircleDot,
  Clock3,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { formatDate, formatMoney, stateLabel, titleCase } from '../../api/format'
import type {
  ComparisonResult,
  DomainEvent,
  ShoppingConstraints,
  WorkflowSummary,
} from '../../api/types'

const phases = ['Request', 'Research', 'Review', 'Approval', 'Checkout', 'Tracking', 'Complete']

const statePhase: Record<WorkflowSummary['state'], number> = {
  created: 0,
  needs_clarification: 0,
  blocked_by_policy: 0,
  researching: 1,
  no_exact_match: 2,
  awaiting_alternative_acceptance: 2,
  comparing: 2,
  proposal_ready: 2,
  awaiting_approval: 3,
  rejected: 3,
  checkout_in_progress: 4,
  checkout_failed: 4,
  ordered: 4,
  tracking: 5,
  completed: 6,
  cancelled: 0,
}

export function WorkflowHeader({ workflow }: { workflow: WorkflowSummary }) {
  const currentPhase = statePhase[workflow.state]
  return (
    <section className="workflow-hero">
      <div className="workflow-hero-top">
        <div>
          <p className="eyebrow">Active buying agent</p>
          <h1>{workflow.summary}</h1>
        </div>
        <span className={`state-badge state-${workflow.state}`}>
          <CircleDot size={14} aria-hidden="true" /> {stateLabel(workflow.state)}
        </span>
      </div>
      <div className="workflow-meta">
        <span><Clock3 size={14} /> Started {formatDate(workflow.createdAt)}</span>
        <span>Updated {formatDate(workflow.updatedAt)}</span>
        <span className="mono-id">#{workflow.id.slice(-8)}</span>
      </div>
      <ol className="progress-track" aria-label="Workflow progress">
        {phases.map((phase, index) => (
          <li key={phase} className={index < currentPhase ? 'done' : index === currentPhase ? 'current' : ''}>
            <span>{index < currentPhase ? <Check size={13} /> : index + 1}</span>
            <small>{phase}</small>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RequestSummary({
  prompt,
  constraints,
}: {
  prompt: string
  constraints?: ShoppingConstraints | null
}) {
  const rows = constraints
    ? [
        ['Category', constraints.productCategory],
        ['Budget', constraints.budgetMax ? formatMoney(constraints.budgetMax) : null],
        ['Delivery', constraints.deliveryDeadline && titleCase(constraints.deliveryDeadline)],
        ['Compatibility', constraints.compatibility?.length ? constraints.compatibility.join(', ') : null],
        ['Must have', constraints.mustHave?.length ? constraints.mustHave.join(', ') : null],
        ['Returns', constraints.requiredReturnDays ? `${constraints.requiredReturnDays}+ days` : null],
      ].filter((row): row is [string, string] => Boolean(row[1]))
    : []

  return (
    <section className="content-card request-card">
      <div className="section-heading">
        <div className="icon-tile"><Sparkles size={18} /></div>
        <div><p className="eyebrow">Your request</p><h2>What the agent understood</h2></div>
      </div>
      <blockquote>“{prompt}”</blockquote>
      {rows.length > 0 && (
        <div className="constraint-grid">
          {rows.map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      )}
    </section>
  )
}

export function ComparisonSection({ comparison }: { comparison?: ComparisonResult | null }) {
  if (!comparison) return null
  return (
    <section className="content-card">
      <div className="section-heading split-heading">
        <div className="heading-group">
          <div className="icon-tile"><ShieldCheck size={18} /></div>
          <div><p className="eyebrow">Evidence &amp; tradeoffs</p><h2>Offer comparison</h2></div>
        </div>
        <span className="confidence">{Math.round(comparison.confidence * 100)}% confidence</span>
      </div>
      <p className="recommendation-copy">{comparison.summary}</p>
      <p className="confidence-note">Confidence summarizes available catalog evidence; it is not a guarantee.</p>
      <div className="offer-list">
        {comparison.rankedOffers.map((offer) => {
          const best = offer.offerId === comparison.bestOfferId
          return (
            <article key={offer.offerId} className={`offer-card ${best ? 'recommended' : ''}`}>
              <div className="offer-rank">#{offer.rank}</div>
              <div className="offer-main">
                <div className="offer-title-row">
                  <h3>{offer.title}</h3>
                  {best && <span className="recommended-label"><PackageCheck size={14} /> Recommended</span>}
                </div>
                <div className="reason-list">
                  {offer.reasons.map((reason) => <span key={reason} className="positive">✓ {reason}</span>)}
                  {offer.tradeoffs.map((tradeoff) => <span key={tradeoff} className="tradeoff">△ {tradeoff}</span>)}
                  {offer.disqualifiers.map((item) => <span key={item} className="negative">× {item}</span>)}
                </div>
              </div>
              <div className="offer-score"><strong>{formatMoney(offer.total)}</strong><span>Score {offer.score.toFixed(1)}</span></div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const importantEvent = (event: DomainEvent) =>
  ['consent', 'checkout', 'tracking'].includes(event.module) ||
  event.type.includes('approval') || event.type.includes('exception')

export function AuditTrail({ events }: { events: DomainEvent[] }) {
  return (
    <aside className="audit-card" aria-label="Audit trail">
      <div className="audit-heading">
        <div><p className="eyebrow">Transparent by design</p><h2>Audit trail</h2></div>
        <span>{events.length} events</span>
      </div>
      <ol className="audit-list">
        {events.map((event) => (
          <li key={event.id} className={importantEvent(event) ? 'important' : ''}>
            <span className="audit-dot" aria-hidden="true" />
            <div>
              <div className="audit-tags"><span>{titleCase(event.module)}</span><span>{event.actor}</span></div>
              <p>{event.summary}</p>
              <time>{formatDate(event.createdAt)}</time>
              {event.data && Object.keys(event.data).length > 0 && (
                <details><summary>Technical details</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>
              )}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}
