import { NextResponse } from "next/server";
import { z } from "zod";
import { ProductStatus, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getStripe, splitAmount, isStripeConfigured } from "@/lib/stripe";
import { createGrant } from "@/lib/downloads";

/**
 * Starts a purchase.
 *
 * Two genuinely different paths:
 *
 *  - **Zero.** No payment processor is involved at all. Creating a Stripe
 *    session for $0 would fail anyway, but more to the point, a free download
 *    should be instant — that is the whole promise. We record the order,
 *    issue a grant, and hand back a download link.
 *
 *  - **Paid.** A Stripe Checkout session with `application_fee_amount` so the
 *    creator's connected account is paid directly and the platform's cut is
 *    taken automatically. The order only becomes COMPLETED when the webhook
 *    confirms it — never on the redirect back, which a user can forge.
 */

const bodySchema = z.object({
  productSlug: z.string().min(1),
  amountCents: z.number().int().min(0).max(100_000_00),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { productSlug, amountCents, email } = parsed.data;

  const product = await db.product.findFirst({
    where: { slug: productSlug, status: ProductStatus.PUBLISHED },
    include: { vendor: true, files: { where: { isPreview: false }, take: 1 } },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Nothing to deliver, so nothing to sell. Several migrated works are
  // stream-only: the audio is the preview and no paid file was ever attached.
  // Checkout used to succeed on those and the download then 404'd, which is
  // taking money for nothing. The product page hides the price control, and
  // this is the guard behind it.
  if (product.files.length === 0) {
    return NextResponse.json(
      { error: "This work is free — there is no file to buy." },
      { status: 409 },
    );
  }

  // Trust the creator's floor, never the client's arithmetic.
  if (amountCents < product.minimumPriceCents) {
    return NextResponse.json(
      { error: "Amount is below the minimum this creator set" },
      { status: 400 },
    );
  }

  const { platformFeeCents, vendorShareCents } = splitAmount(amountCents);

  // ---- free path ---------------------------------------------------------
  if (amountCents === 0) {
    const order = await db.order.create({
      data: {
        status: OrderStatus.COMPLETED,
        email,
        totalPaidCents: 0,
        completedAt: new Date(),
        items: {
          create: {
            productId: product.id,
            pricePaidCents: 0,
            suggestedPriceCents: product.suggestedPriceCents,
          },
        },
      },
    });

    const grant = await createGrant({
      productId: product.id,
      orderId: order.id,
      email,
    });

    await db.product.update({
      where: { id: product.id },
      data: { salesCount: { increment: 1 } },
    });

    return NextResponse.json({ free: true, downloadUrl: `/download/${grant.token}` });
  }

  // ---- paid path ---------------------------------------------------------
  const stripe = getStripe();
  if (!stripe || !isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Payments are not configured yet. Add STRIPE_SECRET_KEY to .env to enable paid checkout.",
      },
      { status: 503 },
    );
  }

  const order = await db.order.create({
    data: {
      status: OrderStatus.PENDING,
      email,
      totalPaidCents: amountCents,
      platformFeeCents,
      vendorShareCents,
      items: {
        create: {
          productId: product.id,
          pricePaidCents: amountCents,
          suggestedPriceCents: product.suggestedPriceCents,
          platformFeeCents,
          vendorShareCents,
        },
      },
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Only route money to the creator once they have actually onboarded with
  // Stripe. Otherwise the payment lands on the platform account and is
  // reconciled to them separately — better than refusing the sale outright.
  const canTransfer =
    product.vendor.stripeAccountId && product.vendor.stripeOnboardingDone;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    // Tags sessions from this flow so they can be compared in the Stripe
    // Dashboard. Fixed label, fixed random suffix — it identifies the
    // integration, so it must not change per request.
    integration_identifier: "pwyw_checkout_qkzrmtvd",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: product.title,
            description: `by ${product.vendor.name ?? product.vendor.username}`,
          },
        },
      },
    ],
    ...(canTransfer
      ? {
          payment_intent_data: {
            application_fee_amount: platformFeeCents,
            transfer_data: { destination: product.vendor.stripeAccountId! },
          },
        }
      : {}),
    // The order id travels with the session so the webhook can find it again
    // without trusting anything the browser sends back.
    metadata: { orderId: order.id, productId: product.id },
    success_url: `${siteUrl}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/product/${product.slug}`,
  });

  await db.order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ free: false, checkoutUrl: session.url });
}
