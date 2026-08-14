import Stripe from "stripe";

/**
 * Stripe Connect, test mode.
 *
 * The platform takes a percentage and the rest goes to the creator's own
 * connected account, so money never sits on our books waiting for a manual
 * payout — which is what the old site did (its dashboard literally told
 * vendors to email info@paywhatyouwant.io to get paid).
 *
 * The client is created lazily. Without it, importing anything that touches
 * this module would throw at build time before keys are configured, and the
 * whole site would fail to render over a feature most visitors never reach.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith("sk_test_...")) return null;
  cached = new Stripe(key);
  return cached;
}

export function isStripeConfigured(): boolean {
  return getStripe() !== null;
}

export function platformFeePercent(): number {
  const raw = Number.parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "10");
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 10;
  return raw;
}

/**
 * Splits an amount into the platform's cut and the creator's.
 *
 * Rounding always favours the creator: the fee is floored, so any half-cent
 * goes to them rather than to us. At this scale the money is trivial; the
 * principle is not, on a platform whose entire proposition is fairness to
 * creators.
 */
export function splitAmount(totalCents: number): {
  platformFeeCents: number;
  vendorShareCents: number;
} {
  if (totalCents <= 0) return { platformFeeCents: 0, vendorShareCents: 0 };
  const platformFeeCents = Math.floor((totalCents * platformFeePercent()) / 100);
  return {
    platformFeeCents,
    vendorShareCents: totalCents - platformFeeCents,
  };
}
