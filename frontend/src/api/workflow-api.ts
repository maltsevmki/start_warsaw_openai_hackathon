import { request } from './client'
import type {
  DemoScenarios,
  DomainEvent,
  OrderStatus,
  WorkflowView,
} from './types'

export const getHealth = (signal?: AbortSignal) =>
  request<{ status: string; mode: string; catalogOffers: number }>('/health', { signal })

export const getDemoScenarios = (signal?: AbortSignal) =>
  request<DemoScenarios>('/api/demo/scenarios', { signal })

export const resetDemo = () => request<void>('/api/demo/reset', { method: 'POST' })

export const startWorkflow = (prompt: string) =>
  request<WorkflowView>('/api/workflows', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })

export const getWorkflow = (workflowId: string, signal?: AbortSignal) =>
  request<WorkflowView>(`/api/workflows/${workflowId}`, { signal })

export const addWorkflowMessage = (workflowId: string, message: string) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })

export const respondToAlternative = (
  workflowId: string,
  input: { accepted: boolean; alternativeId?: string },
) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/accept-alternative`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const approveProposal = (
  workflowId: string,
  input: {
    proposalId: string
    proposalVersion: number
    proposalHash: string
    approved: true
  },
) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/approve`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const rejectProposal = (
  workflowId: string,
  input: { proposalId: string; reason?: string },
) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/reject`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const executeCheckout = (workflowId: string, approvalId: string) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ approvalId }),
  })

export const cancelWorkflow = (workflowId: string) =>
  request<WorkflowView>(`/api/workflows/${workflowId}/cancel`, { method: 'POST' })

export const getWorkflowEvents = (workflowId: string, signal?: AbortSignal) =>
  request<{ workflowId: string; events: DomainEvent[] }>(
    `/api/workflows/${workflowId}/events`,
    { signal },
  )

export const simulateOrderStatus = (orderId: string, status: OrderStatus) =>
  request<WorkflowView>(`/api/orders/${orderId}/simulate-status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
