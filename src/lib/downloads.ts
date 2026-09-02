import crypto from "node:crypto";
import { db } from "./db";

/**
 * Download grants.
 *
 * Paid files live outside the web root and are never addressable by URL. The
 * only way to reach one is a grant: a random token tied to a specific product
 * and a completed order, with an expiry and a download cap.
 *
 * That matters more here than on a typical store. A creator who chose "All
 * Rights Reserved" is trusting the platform that their file will not simply
 * leak out of it, and a guessable or permanent URL would break that promise.
 */

const GRANT_TTL_DAYS = 30;
const MAX_DOWNLOADS = 10;

/**
 * Mints a grant.
 *
 * Every caller that re-issues one — the buyer's library and the guest recovery
 * page — filters on `status: COMPLETED` first, which is what stops a refunded
 * or disputed order handing out a fresh link and undoing the revocation
 * through the front door. A *partial* refund deliberately stays COMPLETED: the
 * buyer paid for it and keeps it.
 */
export async function createGrant(params: {
  productId: string;
  orderId?: string;
  userId?: string;
  email?: string;
}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + GRANT_TTL_DAYS * 86_400_000);

  return db.downloadGrant.create({
    data: {
      token,
      productId: params.productId,
      orderId: params.orderId,
      userId: params.userId,
      email: params.email,
      expiresAt,
      maxDownloads: MAX_DOWNLOADS,
    },
  });
}

export type GrantCheck =
  | { ok: true; grant: NonNullable<Awaited<ReturnType<typeof findGrant>>> }
  | { ok: false; reason: "not-found" | "expired" | "exhausted" | "revoked" };

async function findGrant(token: string) {
  return db.downloadGrant.findUnique({
    where: { token },
    include: {
      product: { include: { files: { where: { isPreview: false } } } },
    },
  });
}

export async function checkGrant(token: string): Promise<GrantCheck> {
  const grant = await findGrant(token);
  if (!grant) return { ok: false, reason: "not-found" };
  // Checked before expiry so a refunded buyer is told the truth rather than
  // that their link "expired". The payment behind this grant was reversed —
  // by refund or chargeback — and the file goes back with the money.
  if (grant.revokedAt) return { ok: false, reason: "revoked" };
  if (grant.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (grant.downloadCount >= grant.maxDownloads) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true, grant };
}

export async function recordDownload(grantId: string) {
  await db.downloadGrant.update({
    where: { id: grantId },
    data: { downloadCount: { increment: 1 } },
  });
}
