import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Headphones,
  HeartPulse,
  Monitor,
  PackageX,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
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
  { key: 'happyPath', title: 'The happy path', tag: 'Monitor', detail: 'Compare → approve → track', icon: Monitor, tone: 'mint' },
  { key: 'clarification', title: 'Clarify first', tag: 'Walking shoes', detail: 'Agent asks for missing details', icon: ShoppingBag, tone: 'blue' },
  { key: 'alternative', title: 'Choose a tradeoff', tag: 'Headphones', detail: 'Explicit constraint change', icon: Headphones, tone: 'violet' },
  { key: 'guardrail', title: 'Safety boundary', tag: 'Restricted item', detail: 'Policy blocks purchase', icon: HeartPulse, tone: 'rose' },
  { key: 'checkoutException', title: 'Checkout protection', tag: 'USB-C hub', detail: 'Stock changes before payment', icon: PackageX, tone: 'amber' },
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
        <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
        <div className="hero-copy">
          <div className="trust-kicker"><ShieldCheck size={15} /> Shopping agent with explicit consent</div>
          <h1>Let the agent search.<br /><em>You</em> make the call.</h1>
          <p>ClearCart researches products, explains the tradeoffs, and pauses before every commitment. Nothing is purchased without your exact approval.</p>
          <div className="trust-points"><span><Check size={15} /> Exact terms before approval</span><span><Check size={15} /> Revalidated before payment</span><span><Check size={15} /> Every step is auditable</span></div>
        </div>
        <div className="composer-card">
          <div className="composer-header"><div><span className="agent-orb"><Sparkles size={18} /></span><div><strong>What should I find?</strong><small>I’ll compare options and come back before buying.</small></div></div><span className={`api-status ${health.isSuccess ? 'online' : health.isError ? 'offline' : ''}`}><i />{health.isSuccess ? 'API ready' : health.isError ? 'API offline' : 'Connecting'}</span></div>
          <label className="sr-only" htmlFor="shopping-prompt">Shopping request</label>
          <textarea id="shopping-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Try: Find me a great monitor under 1000 PLN that works with my MacBook and arrives tomorrow…" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit() }} />
          {fieldError && <p className="field-error">{fieldError}</p>}
          {start.error && <div className="action-error" role="alert">{start.error.message}</div>}
          <div className="composer-footer"><span><Zap size={14} /> Demo uses mock merchants &amp; payment</span><button className="button button-primary" onClick={submit} disabled={start.isPending}>{start.isPending ? <><span className="mini-spinner" /> Starting…</> : <>Start workflow <ArrowRight size={17} /></>}</button></div>
        </div>
      </section>

      <section className="scenario-section page-width">
        <div className="scenario-heading"><div><p className="eyebrow">Five guided demos</p><h2>See every trust boundary in action</h2><p>Pick a scenario to prefill the request, then start when you’re ready.</p></div><button className="reset-button" disabled={reset.isPending} onClick={() => { if (window.confirm('Reset all in-memory demo workflows?')) reset.mutate() }}><RotateCcw size={14} /> {reset.isPending ? 'Resetting…' : 'Reset demo data'}</button></div>
        <div className="scenario-grid">
          {scenarioInfo.map(({ key, title, tag, detail, icon: Icon, tone }, index) => (
            <button key={key} className={`scenario-card tone-${tone}`} onClick={() => { setPrompt(data[key]); setFieldError(''); window.scrollTo({ top: 120, behavior: 'smooth' }) }} style={{ animationDelay: `${index * 70}ms` }}>
              <span className="scenario-icon"><Icon size={20} /></span><span className="scenario-number">0{index + 1}</span><strong>{title}</strong><span className="scenario-tag">{tag}</span><small>{detail}</small><span className="scenario-action">Use this prompt <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="how-section page-width">
        <div className="how-heading"><p className="eyebrow">Designed around consent</p><h2>Three steps. You stay in control.</h2></div>
        <div className="how-grid">
          <article><span><Search size={21} /></span><div><small>01</small><h3>Describe the outcome</h3><p>Use natural language. The agent extracts constraints and asks when something important is missing.</p></div></article>
          <article><span><ShieldCheck size={21} /></span><div><small>02</small><h3>Review exact terms</h3><p>See ranked offers, evidence, tradeoffs, delivery, returns, and the precise total before approving.</p></div></article>
          <article><span><ShoppingBag size={21} /></span><div><small>03</small><h3>Approve, then track</h3><p>Approval and checkout remain separate. Once placed, the mock order has a transparent timeline.</p></div></article>
        </div>
      </section>
    </main>
  )
}
