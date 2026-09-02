import crypto from "node:crypto";
import { OrderStatus } from "@prisma/client";
import { db } from "./db";
import { sendMail, basicHtml, siteUrl } from "./mail";
import { formatMoney } from "./utils";

/**
 * The receipt, and the recovery link behind it.
 *
 * A purchase used to exist in exactly one place: the browser tab it was made
 * in. A signed-in buyer at least had `/purchases`; a guest had nothing, so
 * closing the tab destroyed access to something they had paid for. This is the
 * copy that leaves the tab.
 */

/**
 * Emails a completed order to whoever bought it.
 *
 * Best effort by design. It is called after the order is already COMPLETED and
 * the grants already exist, so a mail failure costs a convenience, not a
 * purchase — and it must never turn a successful payment into an error.
 */
export async function sendOrderReceipt(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { title: true } } } },
        grants: true,
        album: { select: { title: true } },
      },
    });

    if (!order || order.status !== OrderStatus.COMPLETED) return;
    if (!order.email) return; // nothing to send to

    const base = siteUrl();
    const lines = order.items.map((item) => {
      const grant = order.grants.find((g) => g.productId === item.productId);
      const link = grant ? `${base}/download/${grant.token}` : null;
      return { title: item.product.title, link };
    });

    const what = order.album
      ? `${order.album.title} (${lines.length} items)`
      : lines[0]?.title ?? "your purchase";

    const paid =
      order.totalPaidCents > 0
        ? `You paid ${formatMoney(order.totalPaidCents)}.`
        : "You paid nothing for this, which is exactly how it is meant to work.";

    const text = [
      `Thank you — here is ${what}.`,
      "",
      paid,
      "",
      "Your downloads:",
      ...lines.map((l) => `  ${l.title}\n  ${l.link ?? "(link unavailable)"}`),
      "",
      "These links last 30 days and work up to ten times each.",
      `If they run out, you can get fresh ones at ${base}/recover — just enter this email address.`,
      "",
      order.buyerId
        ? `Your purchases are also saved to your account: ${base}/purchases`
        : `You bought this without an account. Keep this email — it is your copy of the purchase.`,
    ].join("\n");

    const html = basicHtml(`Your download${lines.length > 1 ? "s" : ""}`, [
      `Thank you — here is <strong>${escapeHtml(what)}</strong>.`,
      escapeHtml(paid),
      lines
        .map(
          (l) =>
            l.link
              ? `<a href="${l.link}" style="color:#1f6f5c;font-weight:600">${escapeHtml(l.title)}</a>`
              : escapeHtml(l.title),
        )
        .join("<br>"),
      "These links last 30 days and work up to ten times each.",
      `If they run out, get fresh ones at <a href="${base}/recover" style="color:#1f6f5c">${base}/recover</a> — just enter this email address.`,
      order.buyerId
        ? `Your purchases are also saved to your account.`
        : `You bought this without an account, so keep this email — it is your copy of the purchase.`,
    ]);

    await sendMail({
      to: order.email,
      subject: `Your download${lines.length > 1 ? "s" : ""} — ${what}`,
      text,
      html,
    });
  } catch (err) {
    // Swallowed on purpose: see the note above.
    console.error("sendOrderReceipt failed", orderId, err);
  }
}

/* ------------------------------------------------------------- recovery ----

   Proving control of an email address, so someone can get back to what they
   bought without an account.
--------------------------------------------------------------------------- */

const TOKEN_TTL_MINUTES = 60;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a recovery link, good for an hour.
 *
 * Only the hash is stored. The plaintext exists in the email and nowhere else,
 * so a leaked database backup does not hand anyone a working link into
 * somebody's purchases.
 */
export async function createEmailToken(
  email: string,
  purpose: "recover",
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");

  await db.emailToken.create({
    data: {
      tokenHash: hashToken(token),
      email: email.toLowerCase(),
      purpose,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  return token;
}

/**
 * Redeems a token, returning the address it proves.
 *
 * **Valid until it expires, not until it is first opened.** Strict single-use
 * is the tidier rule and it breaks this feature in practice: corporate mail
 * filters, antivirus products and link previewers fetch every URL in an
 * incoming message. That fetch would burn the token before the person ever
 * clicked it — and burn the replacement too, leaving them permanently unable
 * to recover a purchase they had paid for. That is the exact failure this
 * whole flow exists to prevent.
 *
 * The window is an hour, which is the real limit. `usedAt` is still recorded,
 * for the first use only, so there is a trace of when it was picked up.
 */
export async function consumeEmailToken(
  token: string,
  purpose: "recover",
): Promise<string | null> {
  const row = await db.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.expiresAt < new Date()) return null;

  if (!row.usedAt) {
    await db.emailToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  }

  return row.email;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
