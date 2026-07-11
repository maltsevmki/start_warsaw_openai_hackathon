import { Check, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

const stages = [
  { title: 'Understanding your request', detail: 'Identifying the product, budget, timing, and must-have constraints.' },
  { title: 'Planning the search', detail: 'Choosing the most useful merchant and product queries.' },
  { title: 'Searching live offers', detail: 'Looking for purchasable products and verified merchant pages.' },
  { title: 'Comparing the evidence', detail: 'Checking price, delivery, compatibility, returns, and tradeoffs.' },
  { title: 'Preparing your decision', detail: 'Building the clearest recommendation and exact terms to review.' },
] as const

export default function PromptProgress({ prompt }: { prompt: string }) {
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStage((current) => Math.min(current + 1, stages.length - 1))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="prompt-progress" role="status" aria-live="polite">
      <div className="prompt-progress-heading">
        <span className="thinking-orb"><Sparkles size={17} /></span>
        <div><strong>ClearCart is working</strong><small>“{prompt}”</small></div>
      </div>
      <ol>
        {stages.map((stage, index) => {
          const state = index < activeStage ? 'complete' : index === activeStage ? 'active' : 'upcoming'
          return (
            <li className={state} key={stage.title} aria-current={state === 'active' ? 'step' : undefined}>
              <span>{state === 'complete' ? <Check size={14} /> : state === 'active' ? <LoaderCircle className="spin" size={15} /> : <Search size={13} />}</span>
              <div><strong>{stage.title}</strong>{state === 'active' && <small>{stage.detail}</small>}</div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
