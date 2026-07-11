import { Platform } from 'react-native';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const API_BASE_URL = configuredUrl || Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://127.0.0.1:8000',
});

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

function detailMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item && typeof item === 'object' && 'msg' in item
      ? String((item as { msg: unknown }).msg)
      : 'Invalid request').join('. ');
  }
  return fallback;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(API_BASE_URL.includes('ngrok-free') ? { 'ngrok-skip-browser-warning': 'true' } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ApiError(`Cannot reach ClearCart API at ${API_BASE_URL}.`, null, error);
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  throw new ApiError(detailMessage(body, `API returned ${response.status}.`), response.status, body);
}
