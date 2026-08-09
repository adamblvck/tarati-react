import { app } from "./app.js";

// Scaleway Functions HTTP event shape (subset we rely on).
type ScalewayHttpEvent = {
  path?: string;
  resource?: string;
  httpMethod?: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string | null>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type ScalewayHttpResponse = {
  statusCode: number;
  // Set-Cookie may be an array — Scaleway's node runtime hands this map to
  // Fastify's reply.header(), which emits one header line per array element.
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded: boolean;
};

// Adapts a Scaleway Function HTTP event into a WHATWG Request, runs it through
// the Hono app, and maps the Response back. This is the single cloud entrypoint
// (handler = dist/index.handle).
export async function handle(event: ScalewayHttpEvent): Promise<ScalewayHttpResponse> {
  const method = event.httpMethod ?? "GET";
  const path = event.path ?? event.resource ?? "/api/health";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== null) query.set(key, value);
  }
  const url = `https://tarati.internal${path}${query.toString() ? `?${query.toString()}` : ""}`;

  const rawBody = event.body ?? "";
  const body =
    event.isBase64Encoded && rawBody.length > 0
      ? Buffer.from(rawBody, "base64")
      : rawBody.length > 0
        ? rawBody
        : undefined;

  const request = new Request(url, {
    method,
    headers: event.headers,
    body,
  });

  const response = await app.fetch(request);
  const text = await response.text();

  // WHATWG Headers keeps each Set-Cookie separate, but `forEach` yields them
  // all under the same "set-cookie" key — a flat object assignment therefore
  // keeps only the LAST one. Better Auth's sign-out emits three (session_token,
  // session_data, dont_remember), so the cookie that actually clears the
  // session would be dropped and sign-out would silently no-op.
  const headersWithCookies = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof headersWithCookies.getSetCookie === "function"
      ? headersWithCookies.getSetCookie()
      : [];

  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (name === "set-cookie") return; // re-added below, unmerged

    // Scaleway's runtime already sets Content-Type and MERGES ours onto it,
    // yielding "application/json,application/json; charset=utf-8". Clients that
    // sniff the type by splitting on ";" (better-auth's fetch layer does) then
    // see "application/json,application/json", don't recognise it as JSON, and
    // hand back a raw string — which silently breaks every auth call while
    // leaving anything that does its own JSON.parse working fine.
    if (name === "content-type" && /^application\/json\b/.test(value)) return;

    headers[key] = value;
  });

  if (setCookies.length === 1) {
    headers["set-cookie"] = setCookies[0];
  } else if (setCookies.length > 1) {
    headers["set-cookie"] = process.env.SCW_SINGLE_SET_COOKIE
      ? // Escape hatch if the platform ever refuses arrays. session_data and
        // dont_remember are never set here (cookieCache is off, rememberMe
        // defaults true), so keeping only session_token loses nothing.
        (setCookies.find((c) => c.includes("session_token")) ??
          setCookies[setCookies.length - 1])
      : setCookies;
  }

  return {
    statusCode: response.status,
    headers,
    body: text,
    isBase64Encoded: false,
  };
}
