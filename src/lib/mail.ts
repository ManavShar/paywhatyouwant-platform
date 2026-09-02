import fs from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email.
 *
 * The site had none at all — no library, no transport, nothing. That was the
 * single worst gap in the product: a guest who bought something received a
 * download link in one browser tab and nowhere else, so closing it lost what
 * they had paid for, permanently and with no way to ask for it back.
 *
 * Two transports, chosen by configuration:
 *
 *  - **SMTP**, when `SMTP_URL` (or `SMTP_HOST`) is set. Any provider works —
 *    this deliberately does not marry the project to one vendor's API.
 *  - **Outbox**, otherwise. Messages are written to `storage/outbox/` as files
 *    and logged. Mail is never silently dropped, and the whole flow can be
 *    developed and tested before anyone has bought a domain's mail service.
 *
 * Nothing here is allowed to throw into a caller. A receipt that fails to send
 * must not roll back a purchase that has already been paid for — the money
 * moved, the grant exists, and the buyer can still recover the download. The
 * failure is logged and the caller carries on.
 */

const OUTBOX = path.join(process.cwd(), "storage", "outbox");

let cached: Transporter | null = null;

function transport(): Transporter | null {
  if (cached) return cached;

  const url = process.env.SMTP_URL;
  const host = process.env.SMTP_HOST;
  if (!url && !host) return null;

  cached = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        // Port 465 is implicit TLS; everything else starts plaintext and
        // upgrades with STARTTLS.
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASSWORD
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              }
            : undefined,
      });

  return cached;
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "Paywhatyouwant.io <info@paywhatyouwant.io>";
}

export function isMailConfigured(): boolean {
  return transport() !== null;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Sends, or files the message in the outbox. Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = transport();

  if (!t) {
    try {
      await fs.mkdir(OUTBOX, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safe = mail.to.replace(/[^a-zA-Z0-9@._-]/g, "_");
      const file = path.join(OUTBOX, `${stamp}-${safe}.txt`);
      await fs.writeFile(
        file,
        `To: ${mail.to}\nFrom: ${mailFrom()}\nSubject: ${mail.subject}\n\n${mail.text}\n`,
        "utf8",
      );
      console.warn(
        `[mail] SMTP is not configured — wrote "${mail.subject}" for ${mail.to} to ${file}`,
      );
      return false;
    } catch (err) {
      console.error("[mail] could not write to the outbox", err);
      return false;
    }
  }

  try {
    await t.sendMail({
      from: mailFrom(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}`, err);
    return false;
  }
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Wraps body text in the plainest possible HTML.
 *
 * Deliberately not a designed template: a receipt has to survive Gmail,
 * Outlook and a text-only client, and every layout trick is another thing that
 * renders badly somewhere. The plain-text part is the one that matters.
 */
export function basicHtml(title: string, paragraphs: string[]): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a">${p}</p>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
<h1 style="margin:0 0 20px;font-size:20px;color:#1a1a1a">${title}</h1>
${body}
<p style="margin:32px 0 0;font-size:13px;color:#767676">Paywhatyouwant.io — you decide what the work is worth.</p>
</div>`;
}
