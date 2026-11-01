// Fetch wrapper: in-memory access token, transparent refresh via httpOnly cookie.
let accessToken = null;
let refreshing = null;
const listeners = new Set();

export const setAccessToken = (t) => { accessToken = t; };
export const onSessionLost = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export class ApiError extends Error {
  constructor(status, message, code, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

async function doRefresh() {
  if (!refreshing) {
    refreshing = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new ApiError(r.status, j?.error?.message || 'Session expired');
        accessToken = j.data.accessToken;
        return j.data;
      })
      .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}
export const refreshSession = doRefresh;

export async function api(path, { method = 'GET', body, form, retry = true, raw = false } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, { method, headers, credentials: 'include', body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  if (res.status === 401 && retry && accessToken && !path.startsWith('/auth/')) {
    try { await doRefresh(); return api(path, { method, body, form, retry: false, raw }); } catch { accessToken = null; listeners.forEach((fn) => fn()); }
  }
  if (raw) { if (!res.ok) throw new ApiError(res.status, 'Download failed'); return res; }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new ApiError(res.status, json?.error?.message || `Request failed (${res.status})`, json?.error?.code, json?.error?.details);
  return json.data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

export async function upload(slug, kind, file) {
  const form = new FormData();
  form.append('file', file);
  return api(`/t/${slug}/uploads/${kind}`, { method: 'POST', form });
}

/** Opens an authenticated file (PDF/ICS) in a new tab or downloads it */
export async function openFile(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); } else window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
