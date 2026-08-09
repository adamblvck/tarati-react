import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.js";
import { env } from "./env.js";
import { emailTemplates, sendEmail } from "./lib/mailer.js";

const hasGoogleProvider = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const THIRTY_ONE_DAYS_IN_SECONDS = 60 * 60 * 24 * 31;

const hostOf = (value: string | undefined) => {
  if (!value) return "";
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

// Derive a shared cookie domain so the session cookie is accessible across
// subdomains (e.g. tarati.blvckstudios.com + api.tarati.blvckstudios.com).
// Returns undefined for localhost so local dev keeps working normally.
const cookieDomain = (() => {
  const host = hostOf(env.BETTER_AUTH_BASE_URL);
  if (!host) return undefined;
  if (host === "localhost" || host === "127.0.0.1") return undefined;

  // Same-origin deployments (the API reached through the app's own /api/*
  // proxy) must use a HOST-ONLY cookie. Stripping the first label off a
  // three-label host like tarati.blvckstudios.com yields ".blvckstudios.com",
  // which would send Tarati's session cookie to every sibling app on the apex
  // (derivium.*, qquill.*) and let their Better Auth instances pick it up.
  const appHost = hostOf(env.APP_BASE_URL ?? env.BETTER_AUTH_TRUSTED_ORIGIN);
  if (appHost && host === appHost) return undefined;

  const parts = host.split(".");
  return parts.length > 2 ? "." + parts.slice(1).join(".") : undefined;
})();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_BASE_URL,
  trustedOrigins: [
    env.BETTER_AUTH_TRUSTED_ORIGIN ?? env.CORS_ORIGIN ?? env.BETTER_AUTH_BASE_URL,
  ],
  session: {
    expiresIn: THIRTY_ONE_DAYS_IN_SECONDS,
    updateAge: 60 * 60 * 24,
    // Every authenticated request resolves the session, and without this that
    // is a database round trip per poll — with players polling every couple of
    // seconds it becomes the dominant cost and requests queue on the pool.
    // The signed snapshot in the cookie removes the lookup almost entirely.
    // Cost: a revoked session stays usable until the snapshot expires, which
    // for a two-minute window is an acceptable trade here.
    cookieCache: {
      enabled: true,
      maxAge: 120,
    },
  },
  // Better Auth's defaults are per-IP and, for the credential endpoints, only
  // 3 requests per 10 seconds. Everyone on one venue's wifi shares a single
  // NAT'd IP, so at an event the fourth person to sign up in any ten-second
  // window is told "Too many requests" — which reads as "the site is broken".
  // These limits still stop brute force (a password attack needs orders of
  // magnitude more than 60 attempts a minute) while letting a queue of people
  // sign up shoulder to shoulder.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 300,
    customRules: {
      "/sign-up/email": { window: 60, max: 60 },
      "/sign-in/email": { window: 60, max: 60 },
      "/get-session": { window: 60, max: 600 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Verification email is still sent on signup (below), but we don't block
    // sign-in on it so the app is usable before TEM is fully provisioned.
    // Flip to true once a verified sender domain is live.
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      const tpl = emailTemplates.resetPassword(url);
      await sendEmail({ to: user.email, ...tpl });
    },
  },
  emailVerification: {
    // Off by design: sign-in never requires verification (above), and a
    // half-provisioned TEM (secret key set, sender domain not yet verified)
    // makes sendEmail throw *inside* Better Auth's sign-up hook, which would
    // break account creation outright. Reset-password stays wired; it's a cold
    // path that fails safely.
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const tpl = emailTemplates.verifyEmail(url);
      await sendEmail({ to: user.email, ...tpl });
    },
  },
  socialProviders: hasGoogleProvider
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},
  ...(cookieDomain && {
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: cookieDomain,
      },
    },
  }),
});
