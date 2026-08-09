import { getApiBaseUrl } from "../config/apiConfig";

export const getApiUrl = (path) => `${getApiBaseUrl()}${path}`;

// fetch wrapper that always sends cookies (session) and JSON headers.
export async function apiFetch(path, init = {}) {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  return fetch(getApiUrl(path), { credentials: "include", ...init, headers });
}

// Parses JSON and throws a rich error (err.status, err.data) on non-2xx.
export async function apiJson(path, init) {
  const res = await apiFetch(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`api-error:${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
