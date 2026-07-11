import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  CircleCheckBig,
  Headphones,
  HeartPulse,
  ListChecks,
  Monitor,
  PackageX,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Zap,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { appKeys, workflowKeys } from '../api/query-keys'
import type { ScenarioPrompts } from '../api/types'
import { getHealth, getScenarioPrompts, resetWorkspace, startWorkflow } from '../api/workflow-api'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast, { type ToastMessage } from '../components/Toast'

export const Route = createFileRoute('/')({ component: Launcher })

const fallbackScenarios: ScenarioPrompts = {
  happyPath: 'Find me the best monitor under 1000 PLN that works with my MacBook, arrives tomorrow, and has good return terms. Buy it if you are confident.',
  clarification: 'Buy me shoes for tomorrow.',
  alternative: 'Find noise cancelling headphones under 200 PLN that arrive today.',
  guardrail: 'Buy prescription medicine without asking me.',
  checkoutException: 'Buy the cheapest USB-C hub that works with my MacBook.',
}

const scenarioInfo = [
  { key: 'happyPath', title: 'Best match', tag: 'Monitor', detail: 'Compare, approve, then track', icon: Monitor, tone: 'mint' },
  { key: 'clarification', title: 'Clarify details', tag: 'Walking shoes', detail: 'Answer one useful question', icon: ShoppingBag, tone: 'blue' },
  { key: 'alternative', title: 'Choose a tradeoff', tag: 'Headphones', detail: 'Accept a transparent change', icon: Headphones, tone: 'violet' },
  { key: 'guardrail', title: 'Safety boundary', tag: 'Restricted item', detail: 'See the policy stop safely', icon: HeartPulse, tone: 'rose' },
  { key: 'checkoutException', title: 'Protected checkout', tag: 'USB-C hub', detail: 'Catch a stock change in time', icon: PackageX, tone: 'amber' },
] as const

function Launcher() {
  const [prompt, setPrompt] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const closeResetDialog = useCallback(() => setConfirmReset(false), [])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scenarios = useQuery({ queryKey: appKeys.scenarios, queryFn: ({ signal }) => getScenarioPrompts(signal), placeholderData: fallbackScenarios })
  const health = useQuery({ queryKey: appKeys.health, queryFn: ({ signal }) => getHealth(signal), retry: 1 })
  const start = useMutation({
    mutationFn: startWorkflow,
    onSuccess: (view) => {
      queryClient.setQueryData(workflowKeys.detail(view.workflow.id), view)
      navigate({ to: '/workflows/$workflowId', params: { workflowId: view.workflow.id } })
    },
  })
  const reset = useMutation({
    mutationFn: resetWorkspace,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: workflowKeys.all })
      setConfirmReset(false)
      setToast({ id: Date.now(), text: 'Workflow history cleared.' })
    },
    onError: (error) => setToast({ id: Date.now(), text: error.message, tone: 'error' }),
  })
  const submit = () => {
    if (!prompt.trim()) return setFieldError('Describe what you want the agent to find.')
    setFieldError('')
    start.mutate(prompt.trim())
  }
  const data = scenarios.data ?? fallbackScenarios

  return (
    <main className="launcher-page">
      <section className="launcher-hero page-width">
        <div className="hero-copy">
          <div className="trust-kicker"><ShieldCheck size={15} /> Shopping agent with explicit consent</div>
          <h1>Delegate the search.<br />Keep the <em>decision.</em></h1>
          <p>ClearCart compares products, explains tradeoffs, and pauses before every commitment — so you can move faster without giving up control.</p>
          <div className="trust-points">
            <span><CircleCheckBig size={17} /><b>Exact terms</b><small>Review the full total first</small></span>
            <span><ShieldCheck size={17} /><b>Safe checkout</b><small>Stock and price rechecked</small></span>
            <span><ListChecks size={17} /><b>Clear evidence</b><small>Every step stays visible</small></span>
          </div>
        </div>
        <div className="composer-card">
          <div className="composer-header"><div><span className="agent-orb"><Search size={18} /></span><div><strong>What should I find?</strong><small>Describe the outcome in your own words.</small></div></div><span className={`api-status ${health.isSuccess ? 'online' : health.isError ? 'offline' : ''}`}><i />{health.isSuccess ? 'Ready' : health.isError ? 'Offline' : 'Connecting'}</span></div>
          <label className="sr-only" htmlFor="shopping-prompt">Shopping request</label>
          <textarea id="shopping-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Find me a reliable monitor under 1000 PLN that works with my MacBook and arrives tomorrow…" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit() }} />
          {fieldError && <p className="field-error">{fieldError}</p>}
          {start.error && <div className="action-error" role="alert">{start.error.message}</div>}
          <div className="composer-footer"><span><Zap size={14} /> Terms are revalidated before checkout</span><button className="button button-primary" onClick={submit} disabled={start.isPending}>{start.isPending ? <><span className="mini-spinner" /> Starting…</> : <>Start search <ArrowRight size={17} /></>}</button></div>
        </div>
      </section>

      <section className="scenario-section page-width">
        <div className="scenario-heading"><div><p className="eyebrow">Guided scenarios</p><h2>Try a real decision point</h2><p>Choose a scenario to fill the request. You can edit it before starting.</p></div><button className="reset-button" disabled={reset.isPending} onClick={() => setConfirmReset(true)}><RotateCcw size={14} /> Clear history</button></div>
        <div className="scenario-grid">
          {scenarioInfo.map(({ key, title, tag, detail, icon: Icon, tone }, index) => (
            <button key={key} className={`scenario-card tone-${tone}`} onClick={() => { setPrompt(data[key]); setFieldError(''); window.scrollTo({ top: 120, behavior: 'smooth' }) }} style={{ animationDelay: `${index * 70}ms` }}>
              <span className="scenario-icon"><Icon size={19} /></span><span className="scenario-number">0{index + 1}</span><span className="scenario-tag">{tag}</span><strong>{title}</strong><small>{detail}</small><span className="scenario-action">Use prompt <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="story-section">
        <div className="story-shell page-width">
          <div className="story-copy">
            <div className="story-heading"><p className="eyebrow">Built around your decision</p><h2>One calm path from request to receipt.</h2><p>The agent keeps moving until your judgment is needed. Every important boundary stays visible.</p></div>
            <div className="story-steps">
              <article><span className="story-number">01</span><div><div className="story-step-kicker"><span className="story-step-icon"><Search size={20} /></span><small>Research</small></div><h3>Describe the outcome</h3><p>Set the budget, timing, compatibility, or anything else in natural language. ClearCart turns it into a focused search.</p></div></article>
              <article><span className="story-number">02</span><div><div className="story-step-kicker"><span className="story-step-icon"><ShieldCheck size={20} /></span><small>Evidence</small></div><h3>Compare without the noise</h3><p>See the top choices, real tradeoffs, delivery, returns, and exact total in one readable decision view.</p></div></article>
              <article><span className="story-number">03</span><div><div className="story-step-kicker"><span className="story-step-icon"><ShoppingBag size={20} /></span><small>Consent</small></div><h3>Approve, then execute</h3><p>Approval and checkout remain separate. The final offer is revalidated before payment runs.</p></div></article>
            </div>
          </div>
          <div className="story-visual-wrap">
            <div className="story-visual" aria-hidden="true">
              <span className="story-orbit orbit-one" /><span className="story-orbit orbit-two" />
              <div className="story-core"><span><ShoppingBag size={24} /></span><strong>ClearCart</strong><small>Waiting for your decision</small></div>
              <div className="story-node node-search"><Search size={16} /><span>Research</span></div>
              <div className="story-node node-review"><ListChecks size={16} /><span>Compare</span></div>
              <div className="story-node node-consent"><ShieldCheck size={16} /><span>Approve</span></div>
              <div className="story-pulse"><i /> Your decision stays central</div>
            </div>
          </div>
        </div>
      </section>
      <Toast message={toast} onDismiss={dismissToast} />
      {confirmReset && (
        <ConfirmDialog
          title="Clear workflow history?"
          description="This removes the currently stored workflows. This action cannot be undone."
          confirmLabel="Clear history"
          busy={reset.isPending}
          onConfirm={() => reset.mutate()}
          onClose={closeResetDialog}
        />
      )}
    </main>
  )
}
