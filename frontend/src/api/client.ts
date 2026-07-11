const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

export type ApiErrorKind =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'network'
  | 'server'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly kind: ApiErrorKind,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function apiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl
  return typeof window === 'undefined' ? 'http://127.0.0.1:8000' : ''
}

function extractMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((entry) =>
        entry && typeof entry === 'object' && 'msg' in entry
          ? String((entry as { msg: unknown }).msg)
          : 'Invalid request',
      )
      .join('. ')
  }
  return fallback
}

export async function request<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      'The commerce service is unreachable. Check that the API is running and try again.',
      null,
      'network',
      error,
    )
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const kind: ApiErrorKind =
    response.status === 404
      ? 'not_found'
      : response.status === 409
        ? 'conflict'
        : response.status === 422 || response.status === 400
          ? 'validation'
          : 'server'
  throw new ApiError(
    extractMessage(body, `The API returned an unexpected ${response.status} response.`),
    response.status,
    kind,
    body,
  )
}
