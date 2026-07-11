import {
  AlertTriangle,
  Check,
  CircleDot,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { formatDate, formatMoney, stateLabel, titleCase } from '../../api/format'
import type {
  ComparisonResult,
  ShoppingConstraints,
  WorkflowSummary,
  WorkflowView,
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

export function ComparisonSection({
  comparison,
  selectedOfferId,
  canSelect,
  selectingOfferId,
  onSelect,
}: {
  comparison?: ComparisonResult | null
  selectedOfferId?: string
  canSelect: boolean
  selectingOfferId?: string
  onSelect: (offerId: string) => void
}) {
  if (!comparison) return null
  const checks = comparison.requirementChecks ?? []
  const metCount = checks.filter((check) => check.met).length
  return (
    <section className="content-card">
      <div className="section-heading split-heading">
        <div className="heading-group">
          <div className="icon-tile"><ShieldCheck size={18} /></div>
          <div><p className="eyebrow">Evidence &amp; tradeoffs</p><h2>Offer comparison</h2></div>
        </div>
        {checks.length > 0 && (
          <span className="confidence">✓ Meets {metCount} of {checks.length} of your requirements</span>
        )}
      </div>
      <p className="recommendation-copy">{comparison.summary}</p>
      {checks.length > 0 && (
        <div className="reason-list" style={{ margin: '4px 0 16px' }}>
          {checks.map((check) => (
            <span key={check.key} className={check.met ? 'positive' : 'negative'}>
              {check.met ? '✓' : '×'} {check.label}
            </span>
          ))}
        </div>
      )}
      <div className="offer-list">
        {comparison.rankedOffers.slice(0, 3).map((offer) => {
          const best = offer.offerId === comparison.bestOfferId
          const selected = offer.offerId === selectedOfferId
          return (
            <article key={offer.offerId} className={`offer-card ${best ? 'recommended' : ''} ${selected ? 'selected-offer' : ''}`}>
              <div className="offer-rank">#{offer.rank}</div>
              <div className="offer-main">
                <div className="offer-title-row">
                  <h3>{offer.title}</h3>
                  {best && <span className="recommended-label"><PackageCheck size={14} /> AI pick</span>}
                  {selected && <span className="selected-label">Your choice</span>}
                </div>
                <p className="offer-merchant">{offer.merchantName}</p>
                <div className="reason-list">
                  {offer.reasons.map((reason) => <span key={reason} className="positive">✓ {reason}</span>)}
                  {offer.tradeoffs.map((tradeoff) => <span key={tradeoff} className="tradeoff">△ {tradeoff}</span>)}
                  {(offer.riskFlags ?? []).map((risk) => <span key={risk} className="tradeoff">? {titleCase(risk)}</span>)}
                  {offer.disqualifiers.map((item) => <span key={item} className="negative">× {item}</span>)}
                </div>
                {offer.productUrl && (
                  <a className="source-link" href={offer.productUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> View verified merchant page
                  </a>
                )}
              </div>
              <div className="offer-action">
                <strong>{formatMoney(offer.total)}</strong>
                {canSelect && offer.disqualifiers.length === 0 && (
                  <button type="button" disabled={Boolean(selectingOfferId) || selected} onClick={() => onSelect(offer.offerId)}>
                    {selectingOfferId === offer.offerId ? <LoaderCircle className="spin" size={14} /> : selected ? 'Selected' : 'Choose'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const currentStep = (view: WorkflowView) => {
  const state = view.workflow.state
  if (state === 'needs_clarification') return ['Your input is needed', view.clarification?.text ?? view.workflow.summary]
  if (state === 'awaiting_alternative_acceptance') return ['Review the alternatives', 'Your original constraints stay unchanged until you accept an adjustment.']
  if (state === 'awaiting_approval' && view.approval) return ['Ready for checkout', 'Your approval is saved. Checkout still requires a separate action.']
  if (state === 'awaiting_approval') return ['Review the exact terms', 'Check the selected offer and approve only if every term works for you.']
  if (state === 'blocked_by_policy') return ['Purchase stopped safely', view.guardrail?.message ?? view.workflow.summary]
  if (state === 'checkout_failed') return ['Checkout stopped', 'A final validation changed or failed, so the purchase did not continue.']
  if (state === 'tracking') return ['Order in progress', view.order ? `${titleCase(view.order.status)} · ${view.order.deliveryLabel}` : view.workflow.summary]
  if (state === 'completed') return ['Order complete', 'The order has been delivered and the workflow is complete.']
  if (state === 'cancelled' || state === 'rejected') return ['Workflow closed', 'No further purchase action will be taken.']
  return ['Agent is working', view.workflow.summary]
}

const controlMessage = (view: WorkflowView) => {
  const state = view.workflow.state
  if (state === 'awaiting_approval' && !view.approval) return 'No payment can run until you approve the exact proposal terms.'
  if (state === 'awaiting_approval' && view.approval) return 'Approval does not execute checkout. You still control the final action.'
  if (state === 'awaiting_alternative_acceptance') return 'The agent cannot relax your constraints without your explicit choice.'
  if (state === 'needs_clarification') return 'Research is paused until you answer the requested question.'
  if (state === 'checkout_failed') return 'The protection check stopped the purchase before an order was created.'
  if (state === 'blocked_by_policy') return 'The safety boundary prevents this request from reaching checkout.'
  if (state === 'tracking' || state === 'completed') return 'The purchase is complete; this panel now reflects fulfillment information.'
  return 'The agent can research and compare, but commitment remains under your control.'
}

const requiredAction = (view: WorkflowView) => {
  const state = view.workflow.state
  if (state === 'needs_clarification') return 'Answer the requested question to continue research.'
  if (state === 'awaiting_alternative_acceptance') return 'Choose an adjustment or keep your original constraints.'
  if (state === 'awaiting_approval' && !view.approval) return 'Review the exact terms, then approve or decline the proposal.'
  if (state === 'awaiting_approval' && view.approval) return 'Execute checkout when you are ready, or cancel the workflow.'
  if (state === 'checkout_failed') return 'Review what changed, then start another request if needed.'
  if (state === 'blocked_by_policy') return 'Start a different request that can be handled safely.'
  if (state === 'tracking') return 'Follow the delivery status. No purchase decision is required.'
  if (state === 'completed' || state === 'cancelled' || state === 'rejected') return 'No action is required.'
  return 'No action is required while the agent is working.'
}

export function PurchaseControlPanel({ view }: { view: WorkflowView }) {
  const [stepTitle, stepDetail] = currentStep(view)
  const chosenOffer = view.comparison?.rankedOffers.find((offer) => offer.offerId === view.proposal?.offerId)
    ?? view.comparison?.rankedOffers.find((offer) => offer.offerId === view.comparison?.bestOfferId)
  const risks = [
    ...(chosenOffer?.tradeoffs ?? []),
    ...(chosenOffer?.disqualifiers ?? []),
    ...(view.comparison?.missingEvidence ?? []),
    ...(view.proposal && !view.proposal.returns.returnable ? ['This offer is not returnable.'] : []),
    ...(view.checkout?.failureReason ? [`Checkout stopped: ${titleCase(view.checkout.failureReason)}.`] : []),
  ].filter((item, index, items) => items.indexOf(item) === index).slice(0, 3)

  return (
    <aside className="control-card" aria-label="Purchase control">
      <div className="control-heading">
        <div><p className="eyebrow">Useful at a glance</p><h2>Purchase control</h2></div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <div className="control-now">
        <span><Target size={18} /></span>
        <div><small>Now</small><strong>{stepTitle}</strong><p>{stepDetail}</p></div>
      </div>

      {risks.length > 0 && (
        <section className="control-section control-attention">
          <h3><AlertTriangle size={16} /> Worth noting</h3>
          <ul>{risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
        </section>
      )}

      <div className="control-boundary">
        <LockKeyhole size={17} />
        <div><strong>What you need to do</strong><p>{requiredAction(view)}</p></div>
      </div>
      <p className="control-note">{controlMessage(view)}</p>
    </aside>
  )
}
