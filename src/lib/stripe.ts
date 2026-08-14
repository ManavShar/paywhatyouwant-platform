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

/* ------------------------------------------------------------ Connect ------

   Paywhatyouwant.io is a marketplace, not a SaaS platform: buyers purchase
   through this site, we run checkout, and the platform takes a cut. That maps
   to a specific Connect configuration, and the pieces are not independent —

     dashboard          "express"      cobranded, low maintenance
     fees_collector     "application"  the platform owns pricing
     losses_collector   "application"  required for transfer reversals on a
                                       dispute; "stripe" is rejected outright
                                       with destination charges
     charge pattern     destination    with application_fee_amount

   Accounts are created through the **v2** API. The v1 `type: 'express'` form
   is deprecated, as are the `charges_enabled` / `payouts_enabled` flags that
   used to signal readiness — see `accountCanReceiveFunds` below.

   Only the recipient configuration is requested. A marketplace connected
   account is not the merchant of record, so asking for `card_payments` would
   put the creator through a longer onboarding for a capability they never use.
--------------------------------------------------------------------------- */

/** Creates a connected account for a creator and returns its id. */
export async function createConnectedAccount(params: {
  email: string;
  displayName: string;
  country?: string;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const account = await stripe.v2.core.accounts.create({
    contact_email: params.email,
    display_name: params.displayName,
    dashboard: "express",
    identity: { country: params.country ?? "gb" },
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
      currency: "usd",
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    include: ["configuration.recipient"],
  });

  return account.id;
}

/**
 * Whether the account can actually receive money yet.
 *
 * Checked against the v2 capability path rather than the old `charges_enabled`
 * or `payouts_enabled` booleans, which are deprecated and mean something
 * different for a recipient account. Getting this wrong is expensive in a
 * specific way: we would route a real buyer's payment to an account that
 * cannot accept it.
 */
export async function accountCanReceiveFunds(accountId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;

  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });

  return (
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status === "active"
  );
}

/**
 * A one-time link into Stripe-hosted onboarding.
 *
 * Hosted rather than API onboarding: the API route makes the platform build
 * its own remediation flow for every requirement Stripe later asks for, which
 * is a permanent maintenance burden for a marketplace this size.
 */
export async function createOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const link = await stripe.v2.core.accountLinks.create({
    account: params.accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: params.refreshUrl,
        return_url: params.returnUrl,
      },
    },
  });

  return link.url;
}
