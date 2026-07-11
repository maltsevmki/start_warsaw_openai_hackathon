import { request } from './client';
import type { ClarificationReply, OrderStatus, ScenarioPrompts, WorkflowView } from './types';

export const getHealth = () => request<{ status: string }>('/health');
export const getScenarios = () => request<ScenarioPrompts>('/api/demo/scenarios');
export const resetWorkspace = () => request<void>('/api/demo/reset', { method: 'POST' });
export const startWorkflow = (prompt: string) => request<WorkflowView>('/api/workflows', { method: 'POST', body: JSON.stringify({ prompt }) });
export const getWorkflow = (id: string) => request<WorkflowView>(`/api/workflows/${id}`);
export const addMessage = (id: string, reply: ClarificationReply) => request<WorkflowView>(`/api/workflows/${id}/messages`, { method: 'POST', body: JSON.stringify(reply) });
export const respondAlternative = (id: string, accepted: boolean, alternativeId?: string) => request<WorkflowView>(`/api/workflows/${id}/accept-alternative`, { method: 'POST', body: JSON.stringify({ accepted, ...(alternativeId ? { alternativeId } : {}) }) });
export const approveProposal = (id: string, view: WorkflowView) => request<WorkflowView>(`/api/workflows/${id}/approve`, { method: 'POST', body: JSON.stringify({ proposalId: view.proposal!.id, proposalVersion: view.proposal!.version, proposalHash: view.proposal!.hash, approved: true }) });
export const rejectProposal = (id: string, proposalId: string, reason?: string) => request<WorkflowView>(`/api/workflows/${id}/reject`, { method: 'POST', body: JSON.stringify({ proposalId, reason }) });
export const selectOffer = (id: string, offerId: string) => request<WorkflowView>(`/api/workflows/${id}/select-offer`, { method: 'POST', body: JSON.stringify({ offerId }) });
export const checkout = (id: string, approvalId: string) => request<WorkflowView>(`/api/workflows/${id}/checkout`, { method: 'POST', body: JSON.stringify({ approvalId }) });
export const cancelWorkflow = (id: string) => request<WorkflowView>(`/api/workflows/${id}/cancel`, { method: 'POST' });
export const rollbackWorkflow = (id: string, revisionId: string) => request<WorkflowView>(`/api/workflows/${id}/rollback`, { method: 'POST', body: JSON.stringify({ revisionId }) });
export const simulateStatus = (orderId: string, status: OrderStatus) => request<WorkflowView>(`/api/orders/${orderId}/simulate-status`, { method: 'POST', body: JSON.stringify({ status }) });
