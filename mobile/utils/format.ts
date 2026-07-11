import type { Money, WorkflowState } from '@/api/types';

export const money = (value: Money) => new Intl.NumberFormat('en-PL', { style: 'currency', currency: value.currency }).format(value.amount);
export const dateTime = (value: string) => new Intl.DateTimeFormat('en-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const stateLabels: Partial<Record<WorkflowState, string>> = {
  needs_clarification: 'Needs your input', blocked_by_policy: 'Stopped for safety',
  no_exact_match: 'No exact match', awaiting_alternative_acceptance: 'Review alternatives',
  awaiting_approval: 'Your approval needed', checkout_failed: 'Checkout stopped',
  tracking: 'Order in transit', completed: 'Delivered',
};
export const stateLabel = (state: WorkflowState) => stateLabels[state] ?? titleCase(state);
