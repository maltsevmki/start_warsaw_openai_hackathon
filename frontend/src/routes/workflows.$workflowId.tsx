import { createFileRoute, Link } from '@tanstack/react-router'
import { ApiError } from '../api/client'
import { workflowKeys } from '../api/query-keys'
import { getWorkflow } from '../api/workflow-api'
import { WorkflowDetailPage } from '../features/workflow-detail/WorkflowDetailPage'

export const Route = createFileRoute('/workflows/$workflowId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: workflowKeys.detail(params.workflowId),
      queryFn: ({ signal }) => getWorkflow(params.workflowId, signal),
    }),
  pendingComponent: () => <main className="center-state"><div><span className="loading-orbit" /><h1>Loading workflow…</h1></div></main>,
  errorComponent: ({ error, reset }) => {
    const notFound = error instanceof ApiError && error.kind === 'not_found'
    return (
      <main className="center-state">
        <div>
          <p className="eyebrow">{notFound ? 'Workflow not found' : 'API error'}</p>
          <h1>{notFound ? 'This workflow is no longer available' : 'We couldn’t restore this workflow'}</h1>
          <p>{error.message}</p>
          <div className="button-row">
            {!notFound && <button className="button button-secondary" onClick={reset}>Try again</button>}
            <Link className="button button-primary" to="/">Back to launcher</Link>
          </div>
        </div>
      </main>
    )
  },
  component: WorkflowRoute,
})

function WorkflowRoute() {
  const { workflowId } = Route.useParams()
  const initialData = Route.useLoaderData()
  return <WorkflowDetailPage workflowId={workflowId} initialData={initialData} />
}
