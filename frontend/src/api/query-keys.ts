export const workflowKeys = {
  all: ['workflows'] as const,
  list: () => [...workflowKeys.all, 'list'] as const,
  detail: (workflowId: string) => [...workflowKeys.all, 'detail', workflowId] as const,
  events: (workflowId: string) => [...workflowKeys.all, 'events', workflowId] as const,
}

export const appKeys = {
  scenarios: ['app', 'scenarios'] as const,
  health: ['app', 'health'] as const,
}
