import { env } from "../env.js";

interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Sends a transactional email through Scaleway TEM (EU-hosted).
// When TEM isn't configured (local dev without secrets), the email is logged
// instead of sent so auth flows remain testable.
export async function sendEmail({ to, subject, text, html }: SendEmailArgs): Promise<void> {
  if (!env.SCW_SECRET_KEY || !env.SCW_PROJECT_ID || !env.TEM_FROM_EMAIL) {
    console.warn(
      `[mailer] Scaleway TEM not configured — email NOT sent.\n` +
        `  to: ${to}\n  subject: ${subject}\n  text:\n${text}`
    );
    return;
  }

  const url = `https://api.scaleway.com/transactional-email/v1alpha1/regions/${env.SCW_TEM_REGION}/emails`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": env.SCW_SECRET_KEY,
    },
    body: JSON.stringify({
      from: { name: env.TEM_FROM_NAME, email: env.TEM_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      text,
      html,
      project_id: env.SCW_PROJECT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Scaleway TEM send failed (${res.status}): ${body}`);
  }
}

// --- Minimal, dependency-free email templates -----------------------------

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0e0e0e;color:#eee;margin:0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#171717;border:1px solid #2a2a2a;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 16px;color:#fff">${title}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#888;margin-top:28px">If you didn't request this, you can safely ignore this email.</p>
  </div></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${url}" style="background:#fff;color:#111;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>
  <p style="font-size:12px;color:#888;word-break:break-all">Or paste this link into your browser:<br>${url}</p>`;
}

export const emailTemplates = {
  resetPassword(url: string) {
    return {
      subject: "Reset your Tarati password",
      text: `Reset your Tarati password using this link:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
      html: layout(
        "Reset your password",
        `<p style="color:#ccc">We received a request to reset your Tarati password. Click below to choose a new one.</p>${button(
          url,
          "Reset password"
        )}`
      ),
    };
  },
  verifyEmail(url: string) {
    return {
      subject: "Verify your email for Tarati",
      text: `Verify your email for Tarati using this link:\n\n${url}`,
      html: layout(
        "Verify your email",
        `<p style="color:#ccc">Confirm your email address to finish setting up your Tarati account.</p>${button(
          url,
          "Verify email"
        )}`
      ),
    };
  },
};
