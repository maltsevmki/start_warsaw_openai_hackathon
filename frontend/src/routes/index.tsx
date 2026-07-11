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
import { useState } from 'react'
import { demoKeys, workflowKeys } from '../api/query-keys'
import type { DemoScenarios } from '../api/types'
import { getDemoScenarios, getHealth, resetDemo, startWorkflow } from '../api/workflow-api'

export const Route = createFileRoute('/')({ component: Launcher })

const fallbackScenarios: DemoScenarios = {
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scenarios = useQuery({ queryKey: demoKeys.scenarios, queryFn: ({ signal }) => getDemoScenarios(signal), placeholderData: fallbackScenarios })
  const health = useQuery({ queryKey: demoKeys.health, queryFn: ({ signal }) => getHealth(signal), retry: 1 })
  const start = useMutation({
    mutationFn: startWorkflow,
    onSuccess: (view) => {
      queryClient.setQueryData(workflowKeys.detail(view.workflow.id), view)
      navigate({ to: '/workflows/$workflowId', params: { workflowId: view.workflow.id } })
    },
  })
  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: () => queryClient.removeQueries({ queryKey: workflowKeys.all }),
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
          <div className="composer-footer"><span><Zap size={14} /> Safe demo — no real payment</span><button className="button button-primary" onClick={submit} disabled={start.isPending}>{start.isPending ? <><span className="mini-spinner" /> Starting…</> : <>Start search <ArrowRight size={17} /></>}</button></div>
        </div>
      </section>

      <section className="scenario-section page-width">
        <div className="scenario-heading"><div><p className="eyebrow">Guided demos</p><h2>Try a real decision point</h2><p>Choose a scenario to fill the request. You can edit it before starting.</p></div><button className="reset-button" disabled={reset.isPending} onClick={() => { if (window.confirm('Reset all in-memory demo workflows?')) reset.mutate() }}><RotateCcw size={14} /> {reset.isPending ? 'Resetting…' : 'Reset demo'}</button></div>
        <div className="scenario-grid">
          {scenarioInfo.map(({ key, title, tag, detail, icon: Icon, tone }, index) => (
            <button key={key} className={`scenario-card tone-${tone}`} onClick={() => { setPrompt(data[key]); setFieldError(''); window.scrollTo({ top: 120, behavior: 'smooth' }) }} style={{ animationDelay: `${index * 70}ms` }}>
              <span className="scenario-icon"><Icon size={19} /></span><span className="scenario-number">0{index + 1}</span><span className="scenario-tag">{tag}</span><strong>{title}</strong><small>{detail}</small><span className="scenario-action">Use prompt <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="how-section page-width">
        <div className="how-heading"><p className="eyebrow">How it works</p><h2>Helpful automation, clear boundaries.</h2></div>
        <div className="how-grid">
          <article><span><Search size={21} /></span><div><small>Step 1</small><h3>Describe what matters</h3><p>Set the budget, timing, compatibility, or anything else in natural language.</p></div></article>
          <article><span><ShieldCheck size={21} /></span><div><small>Step 2</small><h3>Review the evidence</h3><p>Compare ranked offers, tradeoffs, delivery, returns, and the exact total.</p></div></article>
          <article><span><ShoppingBag size={21} /></span><div><small>Step 3</small><h3>Approve, then execute</h3><p>Consent and checkout stay separate. Nothing runs before you make the call.</p></div></article>
        </div>
      </section>
    </main>
  )
}
