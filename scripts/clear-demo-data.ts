/**
 * Development-only: remove accounts, products and orders created while testing.
 *
 *   npx tsx scripts/clear-demo-data.ts                  # dry run, lists targets
 *   npx tsx scripts/clear-demo-data.ts --confirm        # actually deletes
 *
 * The counterpart to seed-demo-sales.ts. Fabricated revenue sitting in a
 * dashboard is worse than an empty one, because it gets shown to someone and
 * believed.
 *
 * Two guards, because this deletes:
 *  - Refuses to run against a non-local database.
 *  - Never touches a record carrying WordPress provenance (`legacyWpId` /
 *    `legacyWpLogin`). The migrated catalogue is irreplaceable — the old host
 *    is on a clock — so it is out of reach of this script by construction.
 *
 * Dry run by default. Deleting requires --confirm.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to clear data from a non-local database.");
  process.exit(1);
}

const confirmed = process.argv.includes("--confirm");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const PRIVATE_ROOT = path.join(process.cwd(), "storage", "media");
const PUBLIC_ROOT = path.join(process.cwd(), "storage", "public-media");

/** Only files this app wrote via storeUpload live under "uploads/". */
function removeUploadedFile(storageKey: string) {
  if (!storageKey.startsWith("uploads/")) return false;
  let removed = false;
  for (const root of [PRIVATE_ROOT, PUBLIC_ROOT]) {
    const target = path.join(root, storageKey);
    if (!path.resolve(target).startsWith(path.resolve(root))) continue;
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      removed = true;
    }
  }
  return removed;
}

async function main() {
  // Accounts that never came from WordPress are, by definition, ones created
  // during development.
  const testUsers = await db.user.findMany({
    where: { legacyWpLogin: null },
    select: { id: true, username: true, email: true },
  });

  const testProducts = await db.product.findMany({
    where: { legacyWpId: null },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      files: { select: { storageKey: true } },
    },
  });

  // Uploaded images are referenced in three different shapes, and missing any
  // one of them leaves an orphan on disk that nothing points at:
  //  - ProductFile.storageKey  — a bare key
  //  - Product.coverImageUrl   — a "/media/<key>" URL
  //  - VendorPost.imageUrl, User.avatarUrl — likewise
  const imageUrls = [
    ...testProducts.map((p) => p.coverImageUrl),
    ...(
      await db.vendorPost.findMany({
        where: { authorId: { in: testUsers.map((u) => u.id) } },
        select: { imageUrl: true },
      })
    ).map((p) => p.imageUrl),
    ...(
      await db.user.findMany({
        where: { legacyWpLogin: null },
        select: { avatarUrl: true },
      })
    ).map((u) => u.avatarUrl),
  ].filter((u): u is string => typeof u === "string");

  // No real purchase has ever happened on this database, so every order is a
  // test artefact. They are cleared wholesale rather than by pattern, because
  // the guest checkouts carry no marker to match on.
  const orderCount = await db.order.count();

  const posts = await db.vendorPost.count({
    where: { authorId: { in: testUsers.map((u) => u.id) } },
  });

  console.log(`
  test accounts     ${testUsers.length}  ${testUsers.map((u) => u.username).join(", ") || "—"}
  test products     ${testProducts.length}  ${testProducts.map((p) => p.title).join(", ") || "—"}
  vendor posts      ${posts}
  orders            ${orderCount}  (all of them — none are real)
  `);

  if (!confirmed) {
    console.log("  Dry run. Re-run with --confirm to delete.\n");
    return;
  }

  // Order matters. OrderItem.productId is Restrict, so orders must go before
  // the products they reference.
  const grants = await db.downloadGrant.deleteMany({});
  const items = await db.orderItem.deleteMany({});
  const orders = await db.order.deleteMany({});

  let filesRemoved = 0;
  for (const product of testProducts) {
    for (const file of product.files) {
      if (removeUploadedFile(file.storageKey)) filesRemoved += 1;
    }
  }
  for (const url of imageUrls) {
    if (removeUploadedFile(url.replace(/^\/media\//, ""))) filesRemoved += 1;
  }

  // Deleting the user cascades to their products, files, tags and posts.
  const users = await db.user.deleteMany({
    where: { legacyWpLogin: null },
  });

  // Anything left behind by a product whose vendor was migrated.
  const strayProducts = await db.product.deleteMany({ where: { legacyWpId: null } });

  // Migrated accounts arrived without a password — WordPress hashes were not
  // in the export. So any password on one of them was put there by
  // `demo:setup` to make a demo signable-in, and clearing it restores the
  // imported state rather than destroying anything.
  const demoLogins = await db.user.updateMany({
    where: { legacyWpLogin: { not: null }, passwordHash: { not: null } },
    data: { passwordHash: null },
  });

  console.log(`
  removed
    grants          ${grants.count}
    order items     ${items.count}
    orders          ${orders.count}
    accounts        ${users.count}
    stray products  ${strayProducts.count}
    demo logins     ${demoLogins.count}  (password stripped, account kept)
    uploaded files  ${filesRemoved}

  Migrated records were not touched. Run \`npm run migrate:import\` to reset
  the imported products' sales counters to their WordPress values.
  `);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
