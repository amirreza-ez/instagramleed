// API client shared by web and desktop. Access token in memory; refresh via httpOnly cookie (web) or OS-encrypted store (desktop).
export class ApiError extends Error {
  constructor(message: string, public status: number, public errors?: { path: string; message: string }[]) { super(message); }
}

let accessToken: string | null = null;
let baseUrl = '';
let onUnauthorized: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const isDesktop = typeof window !== 'undefined' && !!window.desktop;
export async function initApi() { if (window.desktop) baseUrl = (await window.desktop.getServerUrl()).replace(/\/$/, ''); }
export const apiBase = () => baseUrl;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function setSession(s: { accessToken: string; refreshToken?: string } | null) {
  accessToken = s?.accessToken ?? null;
  if (window.desktop && s?.refreshToken !== undefined) await window.desktop.setRefreshToken(s?.refreshToken ?? null);
  if (window.desktop && !s) await window.desktop.setRefreshToken(null);
}

export async function refreshSession(organizationId?: string): Promise<any | null> {
  const body: any = { organizationId };
  if (window.desktop) { const rt = await window.desktop.getRefreshToken(); if (!rt) return null; body.refreshToken = rt; }
  const r = await fetch(`${baseUrl}/api/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { await setSession(null); return null; }
  const j = await r.json();
  await setSession(j);
  return j;
}

async function doFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  try {
    return await fetch(`${baseUrl}/api${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال اینترنت یا وضعیت سرور را بررسی کنید.', 0);
  }
}

export async function apiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  let r = await doFetch(path, init);
  if (r.status === 401 && !path.startsWith('/auth/')) {
    refreshing ??= refreshSession().then((x) => !!x).finally(() => { refreshing = null; });
    if (await refreshing) r = await doFetch(path, init);
    else { onUnauthorized?.(); }
  }
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    const msg = Array.isArray(j.message) ? j.message.join('، ') : j.message;
    throw new ApiError(msg || (r.status === 429 ? 'تعداد درخواست‌ها زیاد است؛ کمی صبر کنید' : `خطا (${r.status})`), r.status, j.errors);
  }
  return r;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const r = await apiRaw(path, { ...rest, ...(json !== undefined && { body: JSON.stringify(json) }) });
  const ct = r.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? r.json() : r.text()) as Promise<T>;
}
export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const patch = <T = any>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export async function download(path: string, fallbackName: string) {
  const r = await apiRaw(path);
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') ?? '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (o: Record<string, any>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x))); else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};
