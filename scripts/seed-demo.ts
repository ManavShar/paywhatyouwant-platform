/**
 * Development-only: make the site demo-ready in one command.
 *
 *   npm run demo:setup                 # defaults to the "sam" podcast catalogue
 *   npm run demo:setup -- globalgirl   # or any migrated vendor username
 *
 * The catalogue migrated across with its products and its historical sales
 * *counters*, but no Order rows and no passwords — imported accounts were
 * never given one. So out of the box you can browse the site but cannot sign
 * in, and the vendor dashboard has nothing to draw.
 *
 * This does two things, both reversible:
 *   1. Sets a known password on one real migrated creator, so you can sign in
 *      as them and show the dashboard against their actual work.
 *   2. Writes plausible completed orders so the earnings chart and the orders
 *      table have something to show.
 *
 * Undo with `npm run demo:reset`, which clears the orders and strips the
 * password again.
 *
 * Refuses to run against a non-local database. The orders it writes are
 * fabricated, and fabricated revenue in a real ledger is indefensible.
 */

import "dotenv/config";
import { PrismaClient, OrderStatus, ProductStatus, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { splitAmount } from "../src/lib/stripe";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to seed demo data into a non-local database.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const DEMO_PASSWORD = "demo-paywhatyouwant";
const DEFAULT_VENDOR = "sam";

async function main() {
  const username = process.argv[2] ?? DEFAULT_VENDOR;

  const vendor = await db.user.findUnique({ where: { username } });
  if (!vendor) throw new Error(`No creator called "${username}"`);

  const products = await db.product.findMany({
    where: { vendorId: vendor.id, status: ProductStatus.PUBLISHED },
    orderBy: { salesCount: "desc" },
  });
  if (products.length === 0) {
    throw new Error(`"${username}" has nothing published — pick another creator`);
  }

  // 1. A password, so the creator side of the site can be shown at all.
  await db.user.update({
    where: { id: vendor.id },
    data: {
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      role: UserRole.VENDOR,
      vendorSince: vendor.vendorSince ?? new Date("2021-02-08"),
    },
  });

  // 2. Orders. Deliberately a mixed picture: someone paying nothing, several
  //    paying the suggestion, and several paying well over it. That spread is
  //    the argument for the whole model, so a demo that only shows people
  //    paying the asking price undersells it.
  await db.order.deleteMany({ where: { email: { startsWith: "demo-buyer" } } });

  const plan = [
    { monthsAgo: 9, multiplier: 1 },
    { monthsAgo: 7, multiplier: 2 },
    { monthsAgo: 6, multiplier: 0 },
    { monthsAgo: 5, multiplier: 1 },
    { monthsAgo: 5, multiplier: 3 },
    { monthsAgo: 4, multiplier: 1 },
    { monthsAgo: 3, multiplier: 2 },
    { monthsAgo: 2, multiplier: 4 },
    { monthsAgo: 2, multiplier: 1 },
    { monthsAgo: 1, multiplier: 2 },
    { monthsAgo: 1, multiplier: 1 },
    { monthsAgo: 0, multiplier: 3 },
    { monthsAgo: 0, multiplier: 1 },
  ];

  let created = 0;
  for (const [i, entry] of plan.entries()) {
    const product = products[i % products.length];
    // Fall back to a sensible figure when the creator suggested nothing.
    const suggested = product.suggestedPriceCents || 300;
    const paid = Math.round((suggested * entry.multiplier) / 50) * 50;

    const when = new Date();
    when.setUTCMonth(when.getUTCMonth() - entry.monthsAgo);
    when.setUTCDate(Math.min(3 + i * 2, 27));

    const { platformFeeCents, vendorShareCents } = splitAmount(paid);

    await db.order.create({
      data: {
        status: OrderStatus.COMPLETED,
        email: `demo-buyer-${i}@example.com`,
        totalPaidCents: paid,
        platformFeeCents,
        vendorShareCents,
        createdAt: when,
        completedAt: when,
        items: {
          create: {
            productId: product.id,
            pricePaidCents: paid,
            suggestedPriceCents: product.suggestedPriceCents,
            platformFeeCents,
            vendorShareCents,
          },
        },
      },
    });
    created += 1;
  }

  // Keep the denormalised counters honest against what we just wrote.
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
    where: {
      product: { vendorId: vendor.id },
      order: { status: OrderStatus.COMPLETED },
    },
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

  const earned = ((totals._sum.vendorShareCents ?? 0) / 100).toFixed(2);

  console.log(`
  Demo ready.

    sign in at   http://localhost:3000/signin
    email        ${vendor.email}
    password     ${DEMO_PASSWORD}

    creator      ${vendor.name ?? vendor.username}  (/vendor/${vendor.username})
    products     ${products.length}
    orders       ${created}, $${earned} earned

  Undo it all with:  npm run demo:reset
  `);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
