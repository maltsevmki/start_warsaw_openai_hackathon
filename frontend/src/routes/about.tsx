import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="workflow-page">
      <section className="content-card page-width about-card">
        <p className="eyebrow">About ClearCart</p>
        <h1>Commerce automation with a clear consent boundary.</h1>
        <p>
          ClearCart is a safe demo of an agent that can research, compare, and
          prepare a purchase while keeping every commitment in your hands.
        </p>
      </section>
    </main>
  )
}
