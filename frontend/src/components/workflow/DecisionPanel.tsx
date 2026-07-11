import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Clipboard,
  CreditCard,
  LoaderCircle,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatMoney, titleCase } from '../../api/format'
import type { OrderStatus, WorkflowAction, WorkflowView } from '../../api/types'

interface DecisionPanelProps {
  view: WorkflowView
  busy: string | null
  error: string | null
  onClarify: (message: string) => void
  onAlternative: (accepted: boolean, alternativeId?: string) => void
  onApprove: () => void
  onReject: (reason?: string) => void
  onCheckout: () => void
  onCancel: () => void
  onSimulate: (status: OrderStatus) => void
}

const failureCopy: Record<string, string> = {
  missing_approval: 'The approval could not be validated. No payment or order was created.',
  proposal_mismatch: 'The submitted terms did not match the proposal you saw. No payment was made.',
  proposal_expired: 'The approved terms expired before checkout. No payment was made.',
  price_changed: 'The price changed after approval, so checkout stopped and no payment was made.',
  out_of_stock: 'The item became unavailable, so checkout stopped and no payment was made.',
  delivery_changed: 'The delivery commitment changed, so checkout stopped before payment.',
  return_policy_changed: 'The return terms changed, so checkout stopped before payment.',
  payment_failed: 'The mock payment authorization failed and no order was created.',
}

const trackingStatuses: OrderStatus[] = [
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'exception',
]

function ActionError({ message }: { message: string | null }) {
  return message ? <div className="action-error" role="alert"><AlertTriangle size={17} />{message}</div> : null
}

function CancelButton({ show, busy, onClick }: { show: boolean; busy: boolean; onClick: () => void }) {
  return show ? <button className="button button-quiet" disabled={busy} onClick={onClick}><X size={16} /> Cancel workflow</button> : null
}

export function DecisionPanel(props: DecisionPanelProps) {
  const { view } = props
  const actions = new Set<WorkflowAction>(view.workflow.availableActions)
  const common = { actions, ...props }

  if (view.workflow.state === 'needs_clarification' && view.clarification) return <ClarificationCard {...common} />
  if (view.workflow.state === 'blocked_by_policy') return <GuardrailCard view={view} />
  if (view.workflow.state === 'no_exact_match') return <NoMatchCard {...common} />
  if (view.workflow.state === 'awaiting_alternative_acceptance') return <AlternativePicker {...common} />
  if (view.workflow.state === 'awaiting_approval' && view.approval) return <ApprovalReceipt {...common} />
  if (view.workflow.state === 'awaiting_approval' && view.proposal) return <ProposalCard {...common} />
  if (view.workflow.state === 'checkout_failed') return <CheckoutFailureCard {...common} />
  if ((view.workflow.state === 'tracking' || view.workflow.state === 'completed') && view.order) return <OrderTracking {...common} />
  if (['rejected', 'cancelled'].includes(view.workflow.state)) return <TerminalCard view={view} />
  return <ProgressCard {...common} />
}

type CommonProps = DecisionPanelProps & { actions: Set<WorkflowAction> }

function ClarificationCard({ view, actions, busy, error, onClarify, onCancel }: CommonProps) {
  const [message, setMessage] = useState('')
  const [fieldError, setFieldError] = useState('')
  const question = view.clarification!
  const submit = () => {
    if (!message.trim()) return setFieldError('Add a short answer before continuing.')
    setFieldError('')
    onClarify(message.trim())
  }
  return (
    <section className="decision-card decision-question">
      <div className="decision-icon"><RefreshCw size={23} /></div>
      <p className="eyebrow">One detail needed</p>
      <h2>{question.text}</h2>
      <p className="decision-lead">The agent has paused research until you clarify this constraint.</p>
      <div className="example-chips">
        {question.examples.map((example) => <button key={example} type="button" onClick={() => setMessage(example)}>{example}</button>)}
      </div>
      <label htmlFor="clarification">Your answer</label>
      <textarea id="clarification" value={message} onChange={(event) => setMessage(event.target.value)} aria-describedby={fieldError ? 'clarification-error' : undefined} placeholder="Type your answer…" />
      {fieldError && <p className="field-error" id="clarification-error">{fieldError}</p>}
      <ActionError message={error} />
      <div className="button-row">
        {actions.has('reply_to_clarification') && <button className="button button-primary" disabled={Boolean(busy)} onClick={submit}>{busy === 'clarify' ? <><LoaderCircle className="spin" size={17} /> Continuing…</> : <>Continue research <ArrowRight size={17} /></>}</button>}
        <CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} />
      </div>
    </section>
  )
}

function GuardrailCard({ view }: { view: WorkflowView }) {
  return (
    <section className="decision-card decision-guardrail">
      <div className="decision-icon"><ShieldAlert size={24} /></div>
      <p className="eyebrow">Safety boundary</p>
      <h2>This request can’t be purchased by the agent</h2>
      <p className="decision-lead">{view.guardrail?.message ?? 'The request is outside the supported purchasing policy.'}</p>
      <div className="policy-code"><Ban size={16} /> Policy: {titleCase(view.guardrail?.code ?? 'unsupported_request')}</div>
      {view.guardrail?.canSuggestSaferAlternative && <p className="reassurance">A qualified professional or regulated service may be able to help safely.</p>}
      <Link className="button button-primary" to="/">Start a different request</Link>
    </section>
  )
}

function NoMatchCard({ actions, busy, error, onCancel }: CommonProps) {
  return (
    <section className="decision-card">
      <div className="decision-icon"><AlertTriangle size={24} /></div>
      <p className="eyebrow">Search complete</p><h2>No exact match was found</h2>
      <p className="decision-lead">The agent kept your constraints intact and stopped instead of silently choosing a worse fit.</p>
      <ActionError message={error} />
      <div className="button-row"><Link className="button button-primary" to="/">Revise request</Link><CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} /></div>
    </section>
  )
}

function AlternativePicker({ view, actions, busy, error, onAlternative, onCancel }: CommonProps) {
  const [selection, setSelection] = useState('')
  const [fieldError, setFieldError] = useState('')
  return (
    <section className="decision-card">
      <div className="decision-icon"><RotateCcw size={24} /></div>
      <p className="eyebrow">Your constraints, your choice</p>
      <h2>No exact match — would either adjustment work?</h2>
      <p className="decision-lead">Nothing changes unless you explicitly accept one alternative.</p>
      <div className="alternative-list">
        {(view.alternatives ?? []).map((alternative) => (
          <label key={alternative.id} className={`alternative-option ${selection === alternative.id ? 'selected' : ''}`}>
            <input type="radio" name="alternative" value={alternative.id} checked={selection === alternative.id} onChange={() => setSelection(alternative.id)} />
            <span><strong>{alternative.message}</strong><small>{titleCase(alternative.reason)}</small></span>
            <span className="change-chip">{alternative.adjustedConstraints.budgetMax ? `Budget ${formatMoney(alternative.adjustedConstraints.budgetMax)}` : alternative.adjustedConstraints.deliveryDeadline ? `Delivery ${titleCase(alternative.adjustedConstraints.deliveryDeadline)}` : 'Adjusted terms'}</span>
          </label>
        ))}
      </div>
      {fieldError && <p className="field-error">{fieldError}</p>}
      <ActionError message={error} />
      <div className="button-row">
        {actions.has('accept_alternative') && <button className="button button-primary" disabled={Boolean(busy)} onClick={() => { if (!selection) return setFieldError('Select one alternative to continue.'); setFieldError(''); onAlternative(true, selection) }}>{busy === 'alternative' ? <><LoaderCircle className="spin" size={17} /> Applying…</> : <>Accept selected change <ArrowRight size={17} /></>}</button>}
        {actions.has('reject_alternative') && <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => onAlternative(false)}>Keep my original terms</button>}
        <CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} />
      </div>
    </section>
  )
}

function ProposalCard({ view, actions, busy, error, onApprove, onReject, onCancel }: CommonProps) {
  const [reason, setReason] = useState('')
  const proposal = view.proposal!
  return (
    <section className="decision-card proposal-card">
      <div className="proposal-banner"><ShieldCheck size={20} /><span><strong>Ready for your approval</strong><small>The agent cannot purchase until you approve these exact terms.</small></span></div>
      <div className="proposal-title"><div><p className="eyebrow">Immutable proposal · v{proposal.version}</p><h2>{proposal.title}</h2><p>{proposal.merchantName} · Quantity {proposal.quantity}</p></div><strong>{formatMoney(proposal.total)}</strong></div>
      <div className="proposal-facts">
        <div><span>Delivery</span><strong>{proposal.delivery.label}</strong><small>{proposal.delivery.earliest} – {proposal.delivery.latest}</small></div>
        <div><span>Returns</span><strong>{proposal.returns.label}</strong><small>{proposal.returns.returnable ? `${proposal.returns.days} days` : 'Not returnable'}</small></div>
        <div><span>Warranty</span><strong>{proposal.warranty.label}</strong><small>{proposal.warranty.months} months</small></div>
        <div><span>Payment</span><strong>{proposal.paymentMethodLabel}</strong><small>Mock card only</small></div>
      </div>
      <div className="line-items">{proposal.lineItems.map((item) => <div key={item.label}><span>{item.label}</span><strong>{formatMoney(item.amount)}</strong></div>)}<div className="total"><span>Total</span><strong>{formatMoney(proposal.total)}</strong></div></div>
      <div className="approval-copy"><ShieldCheck size={20} /><p>{proposal.approvalText}<small>Expires {formatDate(proposal.expiresAt)}</small></p></div>
      <label htmlFor="rejection-reason">Optional reason if you decline</label>
      <input id="rejection-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. I want a different merchant" />
      <ActionError message={error} />
      <div className="button-row">
        {actions.has('approve_proposal') && <button className="button button-primary button-purchase" disabled={Boolean(busy)} onClick={onApprove}>{busy === 'approve' ? <><LoaderCircle className="spin" size={17} /> Recording approval…</> : <><Check size={17} /> Approve exact terms</>}</button>}
        {actions.has('reject_proposal') && <button className="button button-secondary" disabled={Boolean(busy)} onClick={() => onReject(reason.trim() || undefined)}>Decline proposal</button>}
        <CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} />
      </div>
    </section>
  )
}

function ApprovalReceipt({ view, actions, busy, error, onCheckout, onCancel }: CommonProps) {
  const approval = view.approval!
  const [copied, setCopied] = useState(false)
  const copyHash = async () => { await navigator.clipboard.writeText(approval.proposalHash); setCopied(true) }
  return (
    <section className="decision-card approval-receipt">
      <div className="decision-icon success"><CheckCircle2 size={24} /></div>
      <p className="eyebrow">Consent recorded</p><h2>Approval is saved. Checkout has not run.</h2>
      <p className="decision-lead">This separate checkpoint lets the agent revalidate price, stock, delivery, and return terms before any mock payment.</p>
      <dl className="receipt-grid">
        <div><dt>Decision</dt><dd>{titleCase(approval.decision)}</dd></div><div><dt>Actor</dt><dd>{approval.actor}</dd></div>
        <div><dt>Recorded</dt><dd>{formatDate(approval.decidedAt)}</dd></div><div><dt>Proposal</dt><dd>Version {approval.proposalVersion}</dd></div>
      </dl>
      <div className="hash-row"><span>Bound hash</span><code>{approval.proposalHash.slice(0, 12)}…{approval.proposalHash.slice(-8)}</code><button aria-label="Copy full proposal hash" onClick={copyHash}><Clipboard size={15} /> {copied ? 'Copied' : 'Copy'}</button></div>
      <p className="audit-summary">{approval.auditSummary}</p>
      <ActionError message={error} />
      <div className="button-row">
        {actions.has('execute_checkout') && <button className="button button-primary button-purchase" disabled={Boolean(busy)} onClick={onCheckout}>{busy === 'checkout' ? <><LoaderCircle className="spin" size={17} /> Revalidating…</> : <><CreditCard size={17} /> Execute checkout</>}</button>}
        <CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} />
      </div>
    </section>
  )
}

function CheckoutFailureCard({ view, actions, busy, error, onCancel }: CommonProps) {
  const reason = view.checkout?.failureReason ?? 'unknown'
  return (
    <section className="decision-card decision-failure">
      <div className="decision-icon"><ShieldCheck size={24} /></div><p className="eyebrow">Protection worked</p>
      <h2>Checkout stopped safely</h2><p className="decision-lead">{failureCopy[reason] ?? 'Checkout could not be completed. No order was created.'}</p>
      <div className="policy-code"><AlertTriangle size={16} /> Reason: {titleCase(reason)}</div>
      <ActionError message={error} /><div className="button-row"><Link className="button button-primary" to="/">Start another request</Link><CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} /></div>
    </section>
  )
}

function OrderTracking({ view, actions, busy, error, onSimulate, onCancel }: CommonProps) {
  const order = view.order!
  const completed = view.workflow.state === 'completed'
  return (
    <section className="decision-card order-card">
      <div className={`decision-icon ${completed ? 'success' : ''}`}>{completed ? <CheckCircle2 size={24} /> : <Truck size={24} />}</div>
      <p className="eyebrow">{completed ? 'Delivery complete' : 'Mock order tracking'}</p>
      <h2>{completed ? 'Your order was delivered' : titleCase(order.status)}</h2>
      <p className="decision-lead">{order.title} · {formatMoney(order.total)}</p>
      <div className="order-meta"><span><small>Merchant reference</small><strong>{order.merchantOrderRef}</strong></span><span><small>Tracking number</small><strong>{order.trackingNumber ?? 'Assigned after shipping'}</strong></span><span><small>Delivery</small><strong>{order.deliveryLabel}</strong></span></div>
      <ol className="order-timeline">{order.timeline.map((entry, index) => <li key={`${entry.status}-${entry.happenedAt}`} className={index === order.timeline.length - 1 ? 'current' : ''}><span>{index === order.timeline.length - 1 ? <Package size={15} /> : <Check size={14} />}</span><div><strong>{entry.label}</strong><small>{formatDate(entry.happenedAt)}</small></div></li>)}</ol>
      {actions.has('simulate_tracking') && <div className="simulation-box"><div><strong>Demo-only controls</strong><small>Simulate a merchant tracking update.</small></div><div className="simulation-buttons">{trackingStatuses.map((status) => <button key={status} disabled={Boolean(busy) || status === order.status} onClick={() => onSimulate(status)}>{busy === `tracking-${status}` ? <LoaderCircle className="spin" size={14} /> : titleCase(status)}</button>)}</div></div>}
      <ActionError message={error} /><div className="button-row">{completed && <Link className="button button-primary" to="/">Start another request</Link>}<CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} /></div>
    </section>
  )
}

function TerminalCard({ view }: { view: WorkflowView }) {
  const cancelled = view.workflow.state === 'cancelled'
  return <section className="decision-card"><div className="decision-icon"><X size={24} /></div><p className="eyebrow">Workflow closed</p><h2>{cancelled ? 'Request cancelled' : 'Proposal declined'}</h2><p className="decision-lead">No payment or order was created. You can start again whenever you’re ready.</p><Link className="button button-primary" to="/">Start another request</Link></section>
}

function ProgressCard({ view, actions, busy, error, onCancel }: CommonProps) {
  return <section className="decision-card progress-card"><LoaderCircle className="spin" size={28} /><p className="eyebrow">Agent working</p><h2>{view.workflow.summary}</h2><p className="decision-lead">This workflow is progressing without needing a decision from you right now.</p><ActionError message={error} /><CancelButton show={actions.has('cancel')} busy={Boolean(busy)} onClick={onCancel} /></section>
}
