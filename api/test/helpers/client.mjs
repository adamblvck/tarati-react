// A tiny cookie-jar HTTP client. Each jar is one independent signed-in user,
// which is how the suite runs several "dev accounts" concurrently in one
// process without a browser.

export const BASE = (process.env.TARATI_API_URL ?? "").replace(/\/$/, "");

// Better Auth rejects state-changing requests whose Origin isn't trusted
// ("Missing or null Origin"), and curl/fetch don't set one. Locally the API
// listens on :8787 but trusts the CRA dev server's :3000.
export const ORIGIN =
  process.env.TARATI_ORIGIN ??
  (BASE.includes("localhost:8787") || BASE.includes("127.0.0.1:8787")
    ? "http://localhost:3000"
    : BASE);

export const enabled = Boolean(BASE);

export function makeJar(label = "jar") {
  const cookies = new Map();

  async function raw(path, init = {}) {
    const headers = {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(init.headers ?? {}),
    };
    if (cookies.size) {
      headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });

    // getSetCookie(), never headers.get("set-cookie"): Better Auth emits several
    // cookies and their Expires= values contain commas, so naive comma-splitting
    // corrupts the jar and surfaces later as a baffling 401.
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      if (i < 0) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value === "" || /Max-Age=0/i.test(line)) cookies.delete(name);
      else cookies.set(name, value);
    }
    return res;
  }

  async function json(path, init) {
    const res = await raw(path, init);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        const err = new Error(
          `${label}: ${path} returned non-JSON (${res.status}). ` +
            `First 120 chars: ${text.slice(0, 120)}`
        );
        err.status = res.status;
        throw err;
      }
    }
    if (!res.ok) {
      const err = new Error(`${label}: api-error:${res.status} on ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    label,
    raw,
    json,
    get: (p) => json(p),
    post: (p, body) => json(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
    cookieNames: () => [...cookies.keys()],
  };
}

/** Idempotent so the suite can be re-run against production forever. */
export async function signUpOrSignIn(jar, { name, email, password }) {
  try {
    await jar.post("/api/auth/sign-up/email", { name, email, password });
  } catch (err) {
    if (!err.status || err.status >= 500) throw err;
    await jar.post("/api/auth/sign-in/email", { email, password });
  }
  const me = await jar.get("/api/v1/me");
  if (!me?.user?.id) throw new Error(`${jar.label}: signed in but /me returned no user`);
  return me.user;
}

export const PASSWORD = process.env.E2E_PASSWORD ?? "tarati-e2e-pass-1";

/** Tag every game this run creates so teardown can find them. */
export const runId = process.env.E2E_RUN_ID ?? Math.random().toString(36).slice(2, 8);
export const gameName = (what) => `e2e ${runId} ${what}`;

/**
 * Replay a move list over HTTP as two players.
 * Even plies are White's, odd are Black's; ply is read back from the server
 * each time rather than assumed.
 */
export async function drive(jars, gameId, moves, { stopAfter = Infinity } = {}) {
  let state = null;
  for (let i = 0; i < moves.length && i < stopAfter; i++) {
    const jar = i % 2 === 0 ? jars.white : jars.black;
    const res = await jar.post(`/api/v1/games/${gameId}/moves`, {
      from: moves[i].from,
      to: moves[i].to,
      ply: i,
    });
    state = res.game;
  }
  return state;
}
