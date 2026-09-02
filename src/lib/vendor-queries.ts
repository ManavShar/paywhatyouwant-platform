import { OrderStatus, ProductStatus } from "@prisma/client";
import { db } from "./db";
import type { MonthlyEarning } from "@/components/vendor/EarningsChart";

/**
 * Reads for the vendor dashboard.
 *
 * Every one of these takes a vendorId and filters on it. A dashboard query
 * that could return another vendor's rows is the worst kind of bug here, so
 * the scoping is explicit in each function rather than layered on by callers.
 */

export async function getVendorStats(vendorId: string) {
  const [products, published, sales, views] = await Promise.all([
    db.product.count({ where: { vendorId } }),
    db.product.count({ where: { vendorId, status: ProductStatus.PUBLISHED } }),
    db.orderItem.aggregate({
      where: {
        product: { vendorId },
        order: { status: OrderStatus.COMPLETED },
      },
      _sum: { vendorShareCents: true, pricePaidCents: true },
      _count: { _all: true },
    }),
    db.product.aggregate({
      where: { vendorId },
      _sum: { viewCount: true },
    }),
  ]);

  const totalSales = sales._count._all;
  const pageViews = views._sum.viewCount ?? 0;

  return {
    products,
    published,
    totalSales,
    earningsCents: sales._sum.vendorShareCents ?? 0,
    grossCents: sales._sum.pricePaidCents ?? 0,
    pageViews,
    // Views come from the imported WordPress hit counter, so this is only
    // meaningful for products that carried one across.
    conversionRate: pageViews > 0 ? (totalSales / pageViews) * 100 : 0,
  };
}

/** Earnings bucketed by month, oldest first, with empty months preserved. */
export async function getMonthlyEarnings(
  vendorId: string,
  months = 12,
): Promise<MonthlyEarning[]> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));

  const items = await db.orderItem.findMany({
    where: {
      product: { vendorId },
      order: { status: OrderStatus.COMPLETED, completedAt: { gte: start } },
    },
    select: {
      vendorShareCents: true,
      order: { select: { completedAt: true } },
    },
  });

  // Pre-seed every bucket. A month with no sales must still appear, or the
  // axis silently compresses time and a quiet spell looks like no gap at all.
  const buckets = new Map<string, number>();
  const order: { key: string; date: Date }[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    buckets.set(key, 0);
    order.push({ key, date: d });
  }

  for (const item of items) {
    const when = item.order.completedAt;
    if (!when) continue;
    const key = `${when.getUTCFullYear()}-${when.getUTCMonth()}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + item.vendorShareCents);
    }
  }

  return order.map(({ key, date }) => ({
    label: date.toLocaleDateString("en-GB", { month: "narrow" }),
    fullLabel: date.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    }),
    cents: buckets.get(key) ?? 0,
  }));
}

export async function getVendorProducts(vendorId: string) {
  return db.product.findMany({
    where: { vendorId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      category: true,
      coverImageUrl: true,
      suggestedPriceCents: true,
      salesCount: true,
      earningsCents: true,
      flagReason: true,
      createdAt: true,
      // Whether anything has ever been bought decides whether the row may
      // offer a Delete button at all: `OrderItem.product` is `onDelete:
      // Restrict`, so a sold product can only be unpublished.
      _count: { select: { orderItems: true } },
    },
  });
}

export async function getVendorOrders(vendorId: string, limit = 50) {
  return db.orderItem.findMany({
    where: {
      product: { vendorId },
      order: { status: OrderStatus.COMPLETED },
    },
    orderBy: { order: { completedAt: "desc" } },
    take: limit,
    select: {
      id: true,
      pricePaidCents: true,
      suggestedPriceCents: true,
      vendorShareCents: true,
      platformFeeCents: true,
      product: { select: { title: true, slug: true } },
      order: { select: { completedAt: true, email: true } },
    },
  });
}
