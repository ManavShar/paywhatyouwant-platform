import { OrderStatus, type Prisma } from "@prisma/client";
import { db } from "./db";
import { splitAcross } from "./stripe";
import { sendMail, basicHtml, siteUrl } from "./mail";
import { formatMoney } from "./utils";

/**
 * Undoing a sale.
 *
 * The webhook used to handle three events and none of them was a reversal, so
 * money could go back to a buyer — by refund or by chargeback — and this
 * system would never hear about it. The order stayed COMPLETED, the creator's
 * lifetime earnings stayed inflated, the product's download count stayed up,
 * and the buyer kept a working download link for something they had been given
 * their money back for. Every number on the site was a claim that had quietly
 * stopped being true.
 *
 * Two rules run through all of this:
 *
 *  - **Idempotent.** Stripe retries, and will deliver the same event more than
 *    once. Every function here derives what the state *should* be from the
 *    amount Stripe reports, and does nothing when it is already there.
 *  - **Never invent money.** Reversals are apportioned with the same
 *    `splitAcross` the sale used, so what is taken back off each item sums
 *    exactly to what left the platform.
 */

/**
 * Applies a refund, in whole or in part.
 *
 * `refundedTotalCents` is Stripe's cumulative `amount_refunded` for the
 * charge, not the size of this particular refund — taking the running total
 * from Stripe rather than adding up deltas ourselves is what makes a repeated
 * or out-of-order delivery harmless.
 */
export async function applyRefund(
  orderId: string,
  refundedTotalCents: number,
): Promise<{ applied: boolean; reason?: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { applied: false, reason: "order not found" };

  // Already at or beyond this point — a retry, or an event that arrived after
  // a later one.
  if (refundedTotalCents <= order.refundedCents) {
    return { applied: false, reason: "already applied" };
  }

  const delta = refundedTotalCents - order.refundedCents;
  const isFull = refundedTotalCents >= order.totalPaidCents;

  // The creator's share of what is being returned. On a full refund this comes
  // out to exactly the vendor share recorded at sale time.
  const vendorReversalTotal =
    order.totalPaidCents > 0
      ? Math.round((order.vendorShareCents * delta) / order.totalPaidCents)
      : 0;

  const perItem = splitAcross(
    vendorReversalTotal,
    order.items.map((i) => i.vendorShareCents),
  );

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedCents: refundedTotalCents,
        refundedAt: new Date(),
        // A partial refund leaves the order completed: the buyer still bought
        // it, and still keeps what they downloaded.
        ...(isFull ? { status: OrderStatus.REFUNDED } : {}),
      },
    });

    for (const [index, item] of order.items.entries()) {
      const back = perItem[index] ?? 0;

      await tx.product.update({
        where: { id: item.productId },
        data: {
          earningsCents: { decrement: back },
          // A sale is only un-made by a full refund. A partial one is still a
          // sale that happened.
          ...(isFull ? { salesCount: { decrement: 1 } } : {}),
        },
      });

      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { vendorId: true },
      });
      if (product) {
        await tx.user.update({
          where: { id: product.vendorId },
          data: {
            totalEarnings: { decrement: back },
            ...(isFull ? { totalSales: { decrement: 1 } } : {}),
          },
        });
      }
    }

    if (order.albumId) {
      await tx.album.update({
        where: { id: order.albumId },
        data: {
          earningsCents: { decrement: vendorReversalTotal },
          ...(isFull ? { salesCount: { decrement: 1 } } : {}),
        },
      });
    }

    // Access follows the money, but only when all of it goes back. Someone who
    // was refunded half of a pay-what-you-want price still paid for it.
    if (isFull) {
      await tx.downloadGrant.updateMany({
        where: { orderId: order.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await notifyVendorsOfReversal(orderId, isFull ? "refund" : "partial-refund", delta);
  return { applied: true };
}

/**
 * Opens a dispute: money withdrawn, access withdrawn, outcome unknown.
 *
 * Stripe pulls the funds the moment a chargeback is filed — with destination
 * charges and the platform as loss-bearer, the transfer to the creator is
 * reversed too — so the books have to move now rather than when it is
 * resolved. `closeDispute` puts it all back if the dispute is won.
 */
export async function openDispute(orderId: string): Promise<{ applied: boolean }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { applied: false };
  if (order.status === OrderStatus.DISPUTED) return { applied: false };

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.DISPUTED, disputedAt: new Date() },
    });

    await reverseCountersInTx(tx, order);

    // The buyer is telling their bank they did not authorise this. Leaving the
    // download live while that is argued about would be indefensible.
    await tx.downloadGrant.updateMany({
      where: { orderId: order.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await notifyVendorsOfReversal(orderId, "dispute", order.totalPaidCents);
  return { applied: true };
}

/**
 * Closes a dispute with Stripe's verdict.
 *
 * Won means the money comes back and so should everything else — including the
 * buyer's download, because they turned out to be entitled to it all along.
 * Lost means it stays reversed, and the order is a refund in all but name.
 */
export async function closeDispute(
  orderId: string,
  outcome: string,
): Promise<{ applied: boolean }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { applied: false };
  if (order.status !== OrderStatus.DISPUTED) return { applied: false };

  const won = outcome === "won" || outcome === "warning_closed";

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: won ? OrderStatus.COMPLETED : OrderStatus.REFUNDED,
        disputeOutcome: outcome,
        ...(won ? {} : { refundedCents: order.totalPaidCents, refundedAt: new Date() }),
      },
    });

    if (won) {
      await restoreCountersInTx(tx, order);
      await tx.downloadGrant.updateMany({
        where: { orderId: order.id },
        data: { revokedAt: null },
      });
    }
  });

  return { applied: true };
}

/* ------------------------------------------------------------- internals --- */

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** The transactional client Prisma hands to an interactive `$transaction`. */
type Tx = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Takes the full sale back off every denormalised counter. */
async function reverseCountersInTx(tx: Tx, order: OrderWithItems) {
  for (const item of order.items) {
    await tx.product.update({
      where: { id: item.productId },
      data: {
        salesCount: { decrement: 1 },
        earningsCents: { decrement: item.vendorShareCents },
      },
    });

    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { vendorId: true },
    });
    if (product) {
      await tx.user.update({
        where: { id: product.vendorId },
        data: {
          totalSales: { decrement: 1 },
          totalEarnings: { decrement: item.vendorShareCents },
        },
      });
    }
  }

  if (order.albumId) {
    await tx.album.update({
      where: { id: order.albumId },
      data: {
        salesCount: { decrement: 1 },
        earningsCents: { decrement: order.vendorShareCents },
      },
    });
  }
}

/** The exact inverse, for a dispute that was won. */
async function restoreCountersInTx(tx: Tx, order: OrderWithItems) {
  for (const item of order.items) {
    await tx.product.update({
      where: { id: item.productId },
      data: {
        salesCount: { increment: 1 },
        earningsCents: { increment: item.vendorShareCents },
      },
    });

    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { vendorId: true },
    });
    if (product) {
      await tx.user.update({
        where: { id: product.vendorId },
        data: {
          totalSales: { increment: 1 },
          totalEarnings: { increment: item.vendorShareCents },
        },
      });
    }
  }

  if (order.albumId) {
    await tx.album.update({
      where: { id: order.albumId },
      data: {
        salesCount: { increment: 1 },
        earningsCents: { increment: order.vendorShareCents },
      },
    });
  }
}

/**
 * Tells the creator their earnings just moved.
 *
 * Money leaving a creator's balance without a word is how a marketplace loses
 * the people it depends on. Best effort — a mail failure must not roll back a
 * reversal that has already happened at the payment processor.
 */
async function notifyVendorsOfReversal(
  orderId: string,
  kind: "refund" | "partial-refund" | "dispute",
  amountCents: number,
) {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: { select: { title: true, vendor: { select: { email: true, name: true, username: true } } } },
          },
        },
      },
    });
    if (!order) return;

    // One message per creator, even if an album spans several of their items.
    const byVendor = new Map<string, { name: string; titles: string[] }>();
    for (const item of order.items) {
      const v = item.product.vendor;
      const entry = byVendor.get(v.email) ?? {
        name: v.name ?? v.username,
        titles: [],
      };
      entry.titles.push(item.product.title);
      byVendor.set(v.email, entry);
    }

    const headline =
      kind === "dispute"
        ? "A buyer has disputed a payment"
        : kind === "partial-refund"
          ? "A payment was partly refunded"
          : "A payment was refunded";

    // Reused as the opening sentence, so it needs to read as one rather than
    // as a heading pasted mid-paragraph.
    const opener =
      kind === "dispute"
        ? "A buyer has disputed a payment for"
        : kind === "partial-refund"
          ? "A payment was partly refunded for"
          : "A payment was refunded for";

    const explanation =
      kind === "dispute"
        ? "Their bank has opened a chargeback, so the payment has been withdrawn while it is investigated. If it is resolved in your favour the amount goes back to your balance automatically."
        : "The amount has been taken back off your balance.";

    for (const [email, { name, titles }] of byVendor) {
      await sendMail({
        to: email,
        subject: headline,
        text: [
          `Hello ${name},`,
          "",
          `${opener}: ${titles.join(", ")}.`,
          "",
          `Amount: ${formatMoney(amountCents)}.`,
          explanation,
          "",
          `Your earnings: ${siteUrl()}/dashboard/earnings`,
        ].join("\n"),
        html: basicHtml(headline, [
          `Hello ${name},`,
          `This affects: <strong>${titles.join(", ")}</strong>.`,
          `Amount: <strong>${formatMoney(amountCents)}</strong>.`,
          explanation,
          `<a href="${siteUrl()}/dashboard/earnings" style="color:#1f6f5c;font-weight:600">See your earnings</a>`,
        ]),
      });
    }
  } catch (err) {
    console.error("reversal notification failed", orderId, err);
  }
}
