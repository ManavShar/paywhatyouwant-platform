import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getStripe, accountCanReceiveFunds } from "@/lib/stripe";
import { createGrant } from "@/lib/downloads";

/**
 * The only place an order is allowed to become COMPLETED.
 *
 * The browser redirect after payment is not proof of anything — a user can
 * navigate straight to the success URL. Stripe's signed webhook is the single
 * source of truth about whether money actually moved.
 *
 * Handlers must be idempotent: Stripe retries, and will happily deliver the
 * same event twice. Every write here checks current state first.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret || secret.startsWith("whsec_...")) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Signature verification needs the raw body, not parsed JSON.
  const raw = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (!orderId) break;

      const order = await db.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) break;

      // Already handled by an earlier delivery of this event.
      if (order.status === OrderStatus.COMPLETED) break;

      await db.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: new Date(),
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : undefined,
        },
      });

      for (const item of order.items) {
        await createGrant({
          productId: item.productId,
          orderId: order.id,
          userId: order.buyerId ?? undefined,
          email: order.email ?? undefined,
        });

        // Keep the denormalised counters that drive listings and dashboards.
        await db.product.update({
          where: { id: item.productId },
          data: {
            salesCount: { increment: 1 },
            earningsCents: { increment: item.vendorShareCents },
          },
        });

        const product = await db.product.findUnique({
          where: { id: item.productId },
          select: { vendorId: true },
        });
        if (product) {
          await db.user.update({
            where: { id: product.vendorId },
            data: {
              totalSales: { increment: 1 },
              totalEarnings: { increment: item.vendorShareCents },
            },
          });
        }
      }
      break;
    }

    case "checkout.session.expired": {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) {
        await db.order.updateMany({
          where: { id: orderId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.FAILED },
        });
      }
      break;
    }

    case "account.updated": {
      // Track Connect onboarding so checkout knows when it can safely route
      // money straight to the creator.
      //
      // Readiness is re-read from the v2 capability path rather than taken
      // from this event's payload. `charges_enabled` and `payouts_enabled`
      // are deprecated v1 fields and mean something different for a recipient
      // account — trusting them here would mark a creator ready to be paid
      // when Stripe cannot actually transfer to them.
      const account = event.data.object;
      if (account.id) {
        const ready = await accountCanReceiveFunds(account.id);
        await db.user.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripeOnboardingDone: ready },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
