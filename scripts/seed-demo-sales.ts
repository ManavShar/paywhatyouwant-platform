/**
 * Development-only: fabricate completed orders for one vendor.
 *
 *   npx tsx scripts/seed-demo-sales.ts <username>
 *
 * The dashboard's earnings chart, orders table and stat tiles are all driven
 * by completed orders, and until Stripe test keys exist there is no way to
 * produce one through the UI. This makes those screens testable.
 *
 * Refuses to run against a non-local database — fake revenue in a real ledger
 * would be considerably worse than an untested chart.
 */

import "dotenv/config";
import { PrismaClient, OrderStatus, ProductStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { splitAmount } from "../src/lib/stripe";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to seed demo sales into a non-local database.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error("Usage: tsx scripts/seed-demo-sales.ts <username>");

  const vendor = await db.user.findUnique({ where: { username } });
  if (!vendor) throw new Error(`No vendor called "${username}"`);

  const products = await db.product.findMany({
    where: { vendorId: vendor.id, status: ProductStatus.PUBLISHED },
  });
  if (products.length === 0) throw new Error("That vendor has nothing published");

  // A spread of months and a spread of prices, including someone paying
  // nothing and someone paying well over the suggestion — the whole point of
  // the model is that both happen, so the dashboard should be tested on both.
  const plan = [
    { monthsAgo: 7, paid: 500 },
    { monthsAgo: 5, paid: 0 },
    { monthsAgo: 5, paid: 1200 },
    { monthsAgo: 3, paid: 450 },
    { monthsAgo: 2, paid: 2000 },
    { monthsAgo: 1, paid: 450 },
    { monthsAgo: 1, paid: 750 },
    { monthsAgo: 0, paid: 1500 },
  ];

  let created = 0;
  for (const [i, entry] of plan.entries()) {
    const product = products[i % products.length];
    const when = new Date();
    when.setUTCMonth(when.getUTCMonth() - entry.monthsAgo);
    when.setUTCDate(Math.min(14 + i, 28));

    const { platformFeeCents, vendorShareCents } = splitAmount(entry.paid);

    await db.order.create({
      data: {
        status: OrderStatus.COMPLETED,
        email: `demo-buyer-${i}@example.com`,
        totalPaidCents: entry.paid,
        platformFeeCents,
        vendorShareCents,
        createdAt: when,
        completedAt: when,
        items: {
          create: {
            productId: product.id,
            pricePaidCents: entry.paid,
            suggestedPriceCents: product.suggestedPriceCents,
            platformFeeCents,
            vendorShareCents,
          },
        },
      },
    });
    created += 1;
  }

  // Keep the denormalised counters honest.
  for (const product of products) {
    const agg = await db.orderItem.aggregate({
      where: { productId: product.id, order: { status: OrderStatus.COMPLETED } },
      _count: { _all: true },
      _sum: { vendorShareCents: true },
    });
    await db.product.update({
      where: { id: product.id },
      data: {
        salesCount: agg._count._all,
        earningsCents: agg._sum.vendorShareCents ?? 0,
      },
    });
  }

  const totals = await db.orderItem.aggregate({
    where: { product: { vendorId: vendor.id }, order: { status: OrderStatus.COMPLETED } },
    _count: { _all: true },
    _sum: { vendorShareCents: true },
  });
  await db.user.update({
    where: { id: vendor.id },
    data: {
      totalSales: totals._count._all,
      totalEarnings: totals._sum.vendorShareCents ?? 0,
    },
  });

  console.log(`Created ${created} demo orders for ${username}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
