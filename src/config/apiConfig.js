// API + realtime polling configuration.
//
// REACT_APP_API_BASE_URL is empty in local dev (the CRA dev server proxies
// /api -> http://localhost:8787, so the client talks to the API same-origin and
// session cookies just work). In production it points at the API origin, e.g.
// https://api.tarati.blvckstudios.com.

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  // How often the online game polls the authoritative server state.
  // 1500 looked snappier but every player polling twice a second is the bulk of
  // the API's load at an event, and nobody notices a move landing 2.5s after it
  // was played. Lower this again if the API is comfortably idle.
  pollIntervalMs: 2500,
};

export const getApiBaseUrl = () => API_CONFIG.baseUrl;
