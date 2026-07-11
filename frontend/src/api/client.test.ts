import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('API request errors', () => {
  it('parses FastAPI detail errors and conflict status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Workflow state changed' }), { status: 409, headers: { 'content-type': 'application/json' } })))
    await expect(request('/api/workflows/test')).rejects.toMatchObject({ message: 'Workflow state changed', kind: 'conflict', status: 409 } satisfies Partial<ApiError>)
  })

  it('distinguishes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(request('/health')).rejects.toMatchObject({ kind: 'network', status: null } satisfies Partial<ApiError>)
  })
})
