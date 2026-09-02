import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getStripe, accountCanReceiveFunds } from "@/lib/stripe";
import { createGrant } from "@/lib/downloads";
import { sendOrderReceipt } from "@/lib/receipts";
import { applyRefund, openDispute, closeDispute } from "@/lib/reversals";

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

      // Stripe collects an email at checkout; we were throwing it away. For a
      // guest purchase — no account, nothing else on the row — that address is
      // the only mark of who bought the thing, and without it the order is
      // anonymous to us while Stripe knows exactly who paid. Our own value
      // wins if there is one, because a signed-in buyer's account email is the
      // one their library is keyed to.
      const email = order.email ?? session.customer_details?.email ?? undefined;

      await db.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: new Date(),
          ...(order.email ? {} : { email }),
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
          email,
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
      // Only after the grants exist, and only on the delivery that actually
      // completed the order — the early return above for an already-COMPLETED
      // order is what stops Stripe's retries emailing the buyer twice.
      await sendOrderReceipt(order.id);

      // An album purchase is an ordinary multi-item order — which is why the
      // loop above needed no changes for it — but the album has counters of
      // its own that nothing in that loop touches.
      if (order.albumId) {
        await db.album.update({
          where: { id: order.albumId },
          data: {
            salesCount: { increment: 1 },
            earningsCents: { increment: order.vendorShareCents },
          },
        });
      }

      break;
    }

    /**
     * Money going back the other way.
     *
     * None of these were handled, so a refund or a chargeback left the order
     * COMPLETED, the creator's earnings inflated, the download count wrong and
     * the buyer holding a live download link for something they had been paid
     * back for. Stripe knew; this site did not.
     */
    case "charge.refunded": {
      const charge = event.data.object;
      const order = await orderForCharge(charge.payment_intent);
      if (!order) break;

      // Stripe's cumulative total for the charge, not the size of this refund.
      // Passing the running total is what makes a repeated delivery a no-op.
      await applyRefund(order.id, charge.amount_refunded);
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object;
      const order = await orderForCharge(dispute.payment_intent);
      if (!order) break;

      await openDispute(order.id);
      break;
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const order = await orderForCharge(dispute.payment_intent);
      if (!order) break;

      // `won` gives the money back and, with it, the buyer's download.
      await closeDispute(order.id, dispute.status);
      break;
    }

    case "payment_intent.payment_failed": {
      // A card declined after the session was created. Without this the order
      // sits PENDING for ever and the order page spins on "confirming your
      // payment" with nothing ever arriving.
      const intent = event.data.object;
      await db.order.updateMany({
        where: { stripePaymentIntentId: intent.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.FAILED },
      });
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

/**
 * Finds the order a charge belongs to.
 *
 * Refund and dispute events carry a payment intent rather than our metadata,
 * which is why the intent id is written onto the order the moment the checkout
 * session completes.
 */
async function orderForCharge(paymentIntent: unknown) {
  const id =
    typeof paymentIntent === "string"
      ? paymentIntent
      : (paymentIntent as { id?: string } | null)?.id;
  if (!id) return null;

  return db.order.findUnique({
    where: { stripePaymentIntentId: id },
    select: { id: true },
  });
}
