export const workflowKeys = {
  all: ['workflows'] as const,
  detail: (workflowId: string) => [...workflowKeys.all, 'detail', workflowId] as const,
  events: (workflowId: string) => [...workflowKeys.all, 'events', workflowId] as const,
}

export const demoKeys = {
  scenarios: ['demo', 'scenarios'] as const,
  health: ['demo', 'health'] as const,
}
