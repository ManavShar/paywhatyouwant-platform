import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  isStripeConfigured,
  createConnectedAccount,
  createOnboardingLink,
  accountCanReceiveFunds,
} from "@/lib/stripe";

/**
 * Starts (or resumes) Stripe Connect onboarding for a creator.
 *
 * Creates the connected account once and stores its id, then hands back a
 * fresh hosted onboarding link. Links are single-use and short-lived, so this
 * route is called every time the creator clicks through — resuming an
 * incomplete onboarding is the same path as starting one.
 */
export async function POST() {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return NextResponse.json(
      { error: "You need a creator account." },
      { status: 403 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Payouts are not configured yet. Add STRIPE_SECRET_KEY to .env to enable them.",
      },
      { status: 503 },
    );
  }

  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, name: true, username: true, stripeAccountId: true },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  try {
    let accountId = record.stripeAccountId;

    if (!accountId) {
      accountId = await createConnectedAccount({
        email: record.email,
        displayName: record.name || record.username,
      });
      await db.user.update({
        where: { id: user.id },
        data: { stripeAccountId: accountId },
      });
    }

    const url = await createOnboardingLink({
      accountId,
      // Stripe sends the creator back here if the link has expired; pointing
      // it at this same route mints a new one rather than dead-ending.
      refreshUrl: `${siteUrl}/dashboard/payouts?refresh=1`,
      returnUrl: `${siteUrl}/dashboard/payouts?done=1`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Connect onboarding failed", err);
    return NextResponse.json(
      { error: "Could not start onboarding. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * Re-checks capability status against Stripe and syncs the local flag.
 *
 * The webhook is the primary path, but a creator returning from onboarding
 * should not have to wait on event delivery to see their own status change.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ready: false }, { status: 401 });

  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { stripeAccountId: true, stripeOnboardingDone: true },
  });

  if (!record.stripeAccountId || !isStripeConfigured()) {
    return NextResponse.json({ ready: false, connected: false });
  }

  const ready = await accountCanReceiveFunds(record.stripeAccountId);
  if (ready !== record.stripeOnboardingDone) {
    await db.user.update({
      where: { id: user.id },
      data: { stripeOnboardingDone: ready },
    });
  }

  return NextResponse.json({ ready, connected: true });
}
