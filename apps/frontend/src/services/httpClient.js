const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "medbridge_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = body.error || body.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = body.details;
    throw err;
  }

  return body;
}
