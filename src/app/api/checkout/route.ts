import { NextResponse } from "next/server";
import { z } from "zod";
import { ProductStatus, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  getStripe,
  splitAmount,
  splitAcross,
  isStripeConfigured,
} from "@/lib/stripe";
import { createGrant } from "@/lib/downloads";
import { limit, clientIpFrom } from "@/lib/rate-limit";
import { sendOrderReceipt } from "@/lib/receipts";

/**
 * Starts a purchase — of one product, or of a whole album.
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
 *
 * An album is not a third path. It resolves to the list of products inside it
 * and becomes an ordinary multi-item order, which is the shape `Order`,
 * `OrderItem` and the webhook already had. The only genuinely new logic is
 * dividing one payment across the members — see `splitAcross`.
 */

const bodySchema = z
  .object({
    productSlug: z.string().min(1).optional(),
    albumSlug: z.string().min(1).optional(),
    amountCents: z.number().int().min(0).max(100_000_00),
    email: z.string().email().optional(),
  })
  .refine((b) => Boolean(b.productSlug) !== Boolean(b.albumSlug), {
    message: "Ask for exactly one of a product or an album",
  });

/** What the two shapes of purchase have in common, once resolved. */
type Purchase = {
  /** The label the buyer sees on Stripe's page. */
  title: string;
  vendor: { id: string; stripeAccountId: string | null; stripeOnboardingDone: boolean; name: string | null; username: string };
  minimumPriceCents: number;
  /** Where to send someone who cancels. */
  cancelPath: string;
  albumId: string | null;
  members: {
    id: string;
    suggestedPriceCents: number;
  }[];
};

export async function POST(request: Request) {
  /**
   * Anyone can start a purchase — that is the point, and guest checkout has
   * to keep working. But without a limit, twelve anonymous $0 "purchases" in
   * a row all succeeded, and each one increments the creator's public
   * download count and writes three rows. The number under someone's work is
   * a claim about how many people wanted it; a loop must not be able to write
   * it.
   */
  const gate = await limit("checkout", clientIpFrom(request));
  if (!gate.ok) {
    return NextResponse.json(
      { error: "That's a lot of downloads at once. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { productSlug, albumSlug, amountCents } = parsed.data;

  // Buying does not require an account — that stays true. But when there *is*
  // one, the order has to be attached to it. Every order written before this
  // had a null `buyerId` and a null `email`, which meant a purchase existed
  // nowhere except in the tab the buyer happened to have open: no library, no
  // way to look it up, nothing to re-issue a download against.
  const user = await requireUser();
  const email = user?.email ?? parsed.data.email;

  const purchase = albumSlug
    ? await resolveAlbum(albumSlug)
    : await resolveProduct(productSlug!);

  if ("error" in purchase) {
    return NextResponse.json({ error: purchase.error }, { status: purchase.status });
  }

  // Trust the creator's floor, never the client's arithmetic.
  if (amountCents < purchase.minimumPriceCents) {
    return NextResponse.json(
      { error: "Amount is below the minimum this creator set" },
      { status: 400 },
    );
  }

  const { platformFeeCents, vendorShareCents } = splitAmount(amountCents);

  // One payment, several order lines. The per-member amounts are what move
  // each product's counters, so they have to sum to the amount charged exactly
  // — see `splitAcross`.
  const weights = purchase.members.map((m) => m.suggestedPriceCents);
  const grossParts = splitAcross(amountCents, weights);
  const feeParts = splitAcross(platformFeeCents, weights);

  const itemData = purchase.members.map((m, i) => ({
    productId: m.id,
    pricePaidCents: grossParts[i],
    suggestedPriceCents: m.suggestedPriceCents,
    platformFeeCents: feeParts[i],
    vendorShareCents: grossParts[i] - feeParts[i],
  }));

  // ---- free path ---------------------------------------------------------
  if (amountCents === 0) {
    const order = await db.order.create({
      data: {
        status: OrderStatus.COMPLETED,
        buyerId: user?.id,
        email,
        albumId: purchase.albumId,
        totalPaidCents: 0,
        completedAt: new Date(),
        items: { create: itemData },
      },
    });

    // One grant per member: an album hands over everything inside it.
    const grants = await Promise.all(
      purchase.members.map((m) =>
        createGrant({
          productId: m.id,
          orderId: order.id,
          userId: user?.id,
          email,
        }),
      ),
    );

    await db.product.updateMany({
      where: { id: { in: purchase.members.map((m) => m.id) } },
      data: { salesCount: { increment: 1 } },
    });

    // The webhook does this for paid orders and the free path did not, so a
    // creator's lifetime "sales" quietly disagreed with the download count on
    // their own product page. A free download is still a sale here — that is
    // the entire proposition — it just earns nothing.
    await db.user.update({
      where: { id: purchase.vendor.id },
      data: { totalSales: { increment: purchase.members.length } },
    });

    if (purchase.albumId) {
      await db.album.update({
        where: { id: purchase.albumId },
        data: { salesCount: { increment: 1 } },
      });
    }

    // The buyer's copy, so the purchase survives closing the tab. Awaited
    // rather than fired and forgotten: on a serverless host the function can
    // be frozen the moment the response is returned, and a receipt that races
    // the shutdown is exactly the one nobody notices is missing.
    await sendOrderReceipt(order.id);

    // An album gives back several downloads, so the buyer goes to the order
    // page that lists them all rather than straight into one file.
    return NextResponse.json(
      purchase.albumId
        ? { free: true, downloadUrl: `/order/${order.id}` }
        : { free: true, downloadUrl: `/download/${grants[0].token}` },
    );
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
      buyerId: user?.id,
      email,
      albumId: purchase.albumId,
      totalPaidCents: amountCents,
      platformFeeCents,
      vendorShareCents,
      items: { create: itemData },
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Only route money to the creator once they have actually onboarded with
  // Stripe. Otherwise the payment lands on the platform account and is
  // reconciled to them separately — better than refusing the sale outright.
  const canTransfer =
    purchase.vendor.stripeAccountId && purchase.vendor.stripeOnboardingDone;

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
        // One line, not one per member: the buyer chose a single price for the
        // whole thing, and itemising it on Stripe's page with invented
        // per-track amounts would misrepresent what they agreed to.
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: purchase.title,
            description: `by ${purchase.vendor.name ?? purchase.vendor.username}`,
          },
        },
      },
    ],
    ...(canTransfer
      ? {
          payment_intent_data: {
            application_fee_amount: platformFeeCents,
            transfer_data: { destination: purchase.vendor.stripeAccountId! },
          },
        }
      : {}),
    // The order id travels with the session so the webhook can find it again
    // without trusting anything the browser sends back.
    metadata: { orderId: order.id, ...(purchase.albumId ? { albumId: purchase.albumId } : {}) },
    success_url: `${siteUrl}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}${purchase.cancelPath}`,
  });

  await db.order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ free: false, checkoutUrl: session.url });
}

type Resolved = Purchase | { error: string; status: number };

async function resolveProduct(slug: string): Promise<Resolved> {
  const product = await db.product.findFirst({
    where: { slug, status: ProductStatus.PUBLISHED },
    include: { vendor: true, files: { where: { isPreview: false }, take: 1 } },
  });
  if (!product) return { error: "Product not found", status: 404 };

  // Nothing to deliver, so nothing to sell. Several migrated works are
  // stream-only: the audio is the preview and no paid file was ever attached.
  // Checkout used to succeed on those and the download then 404'd, which is
  // taking money for nothing. The product page hides the price control, and
  // this is the guard behind it.
  if (product.files.length === 0) {
    return { error: "This work is free — there is no file to buy.", status: 409 };
  }

  return {
    title: product.title,
    vendor: product.vendor,
    minimumPriceCents: product.minimumPriceCents,
    cancelPath: `/product/${product.slug}`,
    albumId: null,
    members: [{ id: product.id, suggestedPriceCents: product.suggestedPriceCents }],
  };
}

async function resolveAlbum(slug: string): Promise<Resolved> {
  const album = await db.album.findFirst({
    where: { slug, status: ProductStatus.PUBLISHED },
    include: {
      vendor: true,
      items: {
        orderBy: { position: "asc" },
        include: {
          product: {
            include: { files: { where: { isPreview: false }, take: 1 } },
          },
        },
      },
    },
  });
  if (!album) return { error: "Album not found", status: 404 };

  // Only members that are actually published and actually deliverable. An
  // album whose tracks were individually unpublished must not quietly sell
  // fewer things than its page advertises.
  const members = album.items
    .map((i) => i.product)
    .filter(
      (p) => p.status === ProductStatus.PUBLISHED && p.files.length > 0,
    );

  if (members.length === 0) {
    return {
      error: "There is nothing to download in this album yet.",
      status: 409,
    };
  }

  return {
    title: album.title,
    vendor: album.vendor,
    minimumPriceCents: album.minimumPriceCents,
    cancelPath: `/album/${album.slug}`,
    albumId: album.id,
    members: members.map((p) => ({
      id: p.id,
      suggestedPriceCents: p.suggestedPriceCents,
    })),
  };
}
