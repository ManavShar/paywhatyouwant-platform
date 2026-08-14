/**
 * Stage 3 of 3 — load the manifest into Postgres.
 *
 *   npm run migrate:import
 *
 * Idempotent: every record is upserted on its `legacyWpId` / `legacyWpLogin`,
 * so re-running after a fix updates rather than duplicates.
 *
 * Writes migration/migration-report.md — the human-reviewable record of every
 * judgement the importer made. Nothing is deleted on the basis of a heuristic
 * except illegal content; everything else is merely withheld from publication
 * and listed in that report for Max to overturn.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, Category, Licence, ProductStatus, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { WpManifest } from "./lib/wp-parse";
import { triageProduct, triageUser } from "./lib/triage";
import { storageKeyFor } from "./lib/storage-key";
import { publishAsset } from "./lib/publish-asset";
import { slugify } from "../src/lib/utils";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "migration", "manifest.json");
const MEDIA_STATE = path.join(ROOT, "migration", "media-state.json");
const REPORT = path.join(ROOT, "migration", "migration-report.md");
const STORAGE = path.join(ROOT, "storage", "media");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ------------------------------------------------------------- mappings ----

const CATEGORY_MAP: Record<string, Category> = {
  music: Category.MUSIC,
  photography: Category.PHOTOGRAPHY,
  podcasts: Category.PODCASTS,
  "digital art": Category.DIGITAL_ART,
  digitalart: Category.DIGITAL_ART,
  ebooks: Category.EBOOKS,
};

const LICENCE_MAP: Record<string, Licence> = {
  "creative commons": Licence.CREATIVE_COMMONS,
  "creative commons - no derivs": Licence.CREATIVE_COMMONS_NO_DERIVS,
  "all rights reserved": Licence.ALL_RIGHTS_RESERVED,
  "public domain": Licence.PUBLIC_DOMAIN,
};

function mapCategory(raw: string | undefined): Category | null {
  if (!raw) return null;
  return CATEGORY_MAP[raw.trim().toLowerCase()] ?? null;
}

function mapLicence(raw: string | undefined): Licence {
  if (!raw) return Licence.ALL_RIGHTS_RESERVED;
  // Unknown licence defaults to the most restrictive reading. Guessing
  // permissively on someone else's copyright is not ours to do.
  return LICENCE_MAP[raw.trim().toLowerCase()] ?? Licence.ALL_RIGHTS_RESERVED;
}

/** Strips WordPress/Elementor markup down to readable plain text. */
function cleanDescription(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extOf(name: string): string | undefined {
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : undefined;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  pdf: "application/pdf", zip: "application/zip", mp4: "video/mp4",
  mov: "video/quicktime", docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ---------------------------------------------------------------- import ----

type Report = {
  usersImported: number;
  usersFlagged: { login: string; reason: string }[];
  productsImported: number;
  productsFlagged: { title: string; vendor: string; reason: string }[];
  productsDropped: { title: string; vendor: string; reason: string }[];
  missingMedia: { product: string; url: string }[];
  upgradedToOriginal: { product: string; from: string; to: string }[];
  noOriginalAvailable: string[];
};

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error("migration/manifest.json not found. Run migrate:parse first.");
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as WpManifest;

  const mediaState: Record<string, { status: string; key?: string }> =
    fs.existsSync(MEDIA_STATE)
      ? JSON.parse(fs.readFileSync(MEDIA_STATE, "utf8"))
      : {};

  const report: Report = {
    usersImported: 0,
    usersFlagged: [],
    productsImported: 0,
    productsFlagged: [],
    productsDropped: [],
    missingMedia: [],
    upgradedToOriginal: [],
    noOriginalAvailable: [],
  };

  /** True when the file actually made it onto local disk. */
  const isLocal = (url: string) => {
    if (mediaState[url]?.status !== "ok") return false;
    const key = mediaState[url].key ?? storageKeyFor(url);
    return fs.existsSync(path.join(STORAGE, key));
  };

  const attachmentsById = new Map(manifest.attachments.map((a) => [a.id, a]));

  // WordPress downscales any upload over 2560px and serves the "-scaled" copy,
  // which is what EDD recorded as the purchasable file. A buyer paying for a
  // photograph should get what the photographer actually uploaded, so paid
  // files resolve to the original wherever we managed to fetch one.
  // Covers and previews deliberately keep using the smaller copy.
  const originalByUrl = new Map<string, string>();
  for (const a of manifest.attachments) {
    if (a.originalUrl) originalByUrl.set(a.url, a.originalUrl);
  }

  const resolvePaidSource = (url: string): { url: string; upgraded: boolean } => {
    const mapped = originalByUrl.get(url);
    if (mapped && isLocal(mapped)) return { url: mapped, upgraded: true };

    // Some product files point at a "-scaled" URL that is not registered as an
    // attachment. Derive the original name and use it only if it really landed.
    const derived = url.replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
    if (derived !== url && isLocal(derived)) return { url: derived, upgraded: true };

    return { url, upgraded: false };
  };

  // ---- users -------------------------------------------------------------
  // Only users who actually uploaded something become vendors; the export
  // contains many accounts that never published.
  const vendorLogins = new Set(manifest.products.map((p) => p.authorLogin));
  const usersById = new Map(manifest.users.map((u) => [u.id, u]));
  const userIdByLogin = new Map<string, string>();

  for (const user of manifest.users) {
    if (!vendorLogins.has(user.login)) continue;

    const verdict = triageUser(user);
    if (verdict.action === "flag") {
      report.usersFlagged.push({ login: user.login, reason: verdict.reason });
    }

    const username = slugify(user.login) || `vendor-${user.id}`;
    const email = user.email || `${username}@imported.paywhatyouwant.io`;

    const record = await db.user.upsert({
      where: { legacyWpLogin: user.login },
      update: {
        name: user.displayName,
        role: UserRole.VENDOR,
      },
      create: {
        email,
        username,
        name: user.displayName,
        role: UserRole.VENDOR,
        legacyWpLogin: user.login,
        vendorSince: new Date(),
      },
    });

    userIdByLogin.set(user.login, record.id);
    report.usersImported += 1;
  }

  // ---- tags --------------------------------------------------------------
  const tagIdBySlug = new Map<string, string>();
  const allTags = new Map<string, string>(); // slug -> display name
  for (const p of manifest.products) {
    for (const t of p.tags) {
      const slug = slugify(t);
      if (slug) allTags.set(slug, t);
    }
  }
  for (const [slug, name] of allTags) {
    const tag = await db.tag.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    tagIdBySlug.set(slug, tag.id);
  }

  // ---- products ----------------------------------------------------------
  for (const product of manifest.products) {
    const vendorLogin = product.commissionUserId
      ? (usersById.get(product.commissionUserId)?.login ?? product.authorLogin)
      : product.authorLogin;

    const verdict = triageProduct(product, vendorLogin);

    if (verdict.action === "drop") {
      report.productsDropped.push({
        title: product.title,
        vendor: vendorLogin,
        reason: verdict.reason,
      });
      continue;
    }

    const vendorId = userIdByLogin.get(vendorLogin);
    if (!vendorId) {
      report.productsFlagged.push({
        title: product.title,
        vendor: vendorLogin,
        reason: "Vendor account missing from the export",
      });
      continue;
    }

    // A product can fail more than one check. Gather every reason so the
    // report explains the decision fully, but record the product only once —
    // otherwise the published/flagged totals double-count and stop adding up.
    const flagReasons: string[] = [];
    if (verdict.action === "flag") flagReasons.push(verdict.reason);

    const category = mapCategory(product.category);
    if (!category) {
      flagReasons.push(
        `Unrecognised category "${product.category ?? "(none)"}"`,
      );
    }

    // Cover image, resolved from the WordPress thumbnail attachment.
    let coverImageUrl: string | null = null;
    if (product.thumbnailId) {
      const att = attachmentsById.get(product.thumbnailId);
      if (att && isLocal(att.url)) {
        const key = mediaState[att.url].key ?? storageKeyFor(att.url);
        // Covers are public, so they get copied into the statically-served tree.
        coverImageUrl = publishAsset(STORAGE, key);
      } else if (att) {
        report.missingMedia.push({ product: product.title, url: att.url });
      }
    }

    const status: ProductStatus =
      flagReasons.length > 0 ? ProductStatus.FLAGGED : ProductStatus.PUBLISHED;

    if (flagReasons.length > 0) {
      report.productsFlagged.push({
        title: product.title,
        vendor: vendorLogin,
        reason: flagReasons.join("; "),
      });
    }

    const slug =
      slugify(product.slug || product.title) || `product-${product.id}`;

    const saved = await db.product.upsert({
      where: { legacyWpId: product.id },
      update: {
        title: product.title,
        description: cleanDescription(product.description),
        category: category ?? Category.DIGITAL_ART,
        licence: mapLicence(product.licence),
        status,
        suggestedPriceCents: product.suggestedPriceCents,
        minimumPriceCents: product.minimumPriceCents,
        coverImageUrl,
        flagReason: flagReasons.length > 0 ? flagReasons.join("; ") : null,
      },
      create: {
        legacyWpId: product.id,
        // Slugs must be unique; suffix with the legacy id to guarantee it.
        slug: `${slug}-${product.id}`,
        title: product.title,
        description: cleanDescription(product.description),
        category: category ?? Category.DIGITAL_ART,
        licence: mapLicence(product.licence),
        status,
        suggestedPriceCents: product.suggestedPriceCents,
        minimumPriceCents: product.minimumPriceCents,
        coverImageUrl,
        vendorId,
        salesCount: product.salesCount,
        earningsCents: product.earningsCents,
        viewCount: product.hits,
        averageRating: product.averageRating ?? null,
        publishedAt: product.date ? new Date(product.date) : new Date(),
        flagReason: flagReasons.length > 0 ? flagReasons.join("; ") : null,
      },
    });

    // ---- files (paid assets) --------------------------------------------
    await db.productFile.deleteMany({ where: { productId: saved.id } });

    for (const file of product.files) {
      if (!isLocal(file.url)) {
        report.missingMedia.push({ product: product.title, url: file.url });
        continue;
      }
      const source = resolvePaidSource(file.url);
      if (source.upgraded) {
        report.upgradedToOriginal.push({
          product: product.title,
          from: file.url.split("/").pop() ?? file.url,
          to: source.url.split("/").pop() ?? source.url,
        });
      } else if (/-scaled\.[a-z0-9]+$/i.test(file.url)) {
        report.noOriginalAvailable.push(product.title);
      }

      // Name the file after whichever variant is actually delivered, so the
      // buyer's download does not claim to be something it is not.
      const fileName = source.upgraded
        ? decodeURIComponent(source.url.split("/").pop() ?? file.name)
        : file.name;
      const ext = extOf(fileName);
      const key = mediaState[source.url]?.key ?? storageKeyFor(source.url);
      const full = path.join(STORAGE, key);
      await db.productFile.create({
        data: {
          productId: saved.id,
          isPreview: false,
          fileName,
          storageKey: key,
          extension: ext,
          mimeType: ext ? MIME_BY_EXT[ext] : undefined,
          sizeBytes: fs.existsSync(full) ? fs.statSync(full).size : null,
          legacySourceUrl: source.url,
          downloadedAt: new Date(),
        },
      });
    }

    // ---- preview files (free, streamable, embeddable) --------------------
    for (const attId of product.previewAttachmentIds) {
      const att = attachmentsById.get(attId);
      if (!att || !isLocal(att.url)) continue;
      const name = decodeURIComponent(att.url.split("/").pop() ?? "preview");
      const ext = extOf(name);
      const key = mediaState[att.url].key ?? storageKeyFor(att.url);
      const full = path.join(STORAGE, key);
      // Previews are free by design — the whole point is that anyone can hear
      // or see them before deciding what to pay, including inside an embed.
      publishAsset(STORAGE, key);
      await db.productFile.create({
        data: {
          productId: saved.id,
          isPreview: true,
          fileName: name,
          storageKey: key,
          extension: ext,
          mimeType: ext ? MIME_BY_EXT[ext] : undefined,
          sizeBytes: fs.existsSync(full) ? fs.statSync(full).size : null,
          legacySourceUrl: att.url,
          downloadedAt: new Date(),
        },
      });
    }

    // ---- tags ------------------------------------------------------------
    await db.tagsOnProducts.deleteMany({ where: { productId: saved.id } });
    const seen = new Set<string>();
    for (const t of product.tags) {
      const tagId = tagIdBySlug.get(slugify(t));
      if (!tagId || seen.has(tagId)) continue;
      seen.add(tagId);
      await db.tagsOnProducts.create({
        data: { productId: saved.id, tagId },
      });
    }

    report.productsImported += 1;
  }

  // ---- denormalised counters --------------------------------------------
  const vendors = await db.user.findMany({
    where: { role: UserRole.VENDOR },
    select: { id: true },
  });
  for (const v of vendors) {
    const agg = await db.product.aggregate({
      where: { vendorId: v.id, status: ProductStatus.PUBLISHED },
      _count: { _all: true },
      _sum: { salesCount: true, earningsCents: true },
    });
    await db.user.update({
      where: { id: v.id },
      data: {
        productCount: agg._count._all,
        totalSales: agg._sum.salesCount ?? 0,
        totalEarnings: agg._sum.earningsCents ?? 0,
      },
    });
  }

  writeReport(report, manifest);

  console.log(`
  users imported     ${report.usersImported}  (${report.usersFlagged.length} flagged)
  products imported  ${report.productsImported}
    published        ${report.productsImported - report.productsFlagged.length}
    held for review  ${report.productsFlagged.length}
    dropped          ${report.productsDropped.length}
  media missing      ${report.missingMedia.length}
  files upgraded     ${report.upgradedToOriginal.length}  (now full resolution)

  → migration/migration-report.md`);
}

function writeReport(report: Report, manifest: WpManifest) {
  const lines: string[] = [];
  lines.push("# WordPress migration report", "");
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push(`Source: \`${path.basename(manifest.sourceFile)}\``, "");

  lines.push("## Summary", "");
  lines.push("| | Count |");
  lines.push("|---|---:|");
  lines.push(`| Vendors imported | ${report.usersImported} |`);
  lines.push(`| Products imported | ${report.productsImported} |`);
  lines.push(`| — published | ${report.productsImported - report.productsFlagged.length} |`);
  lines.push(`| — held for review | ${report.productsFlagged.length} |`);
  lines.push(`| Products dropped | ${report.productsDropped.length} |`);
  lines.push(`| Media files missing | ${report.missingMedia.length} |`);
  lines.push("");

  if (report.productsDropped.length) {
    lines.push("## Dropped — not imported at all", "");
    lines.push(
      "These were **not** written to the database. This is the only category the importer deletes outright.",
      "",
    );
    for (const d of report.productsDropped) {
      lines.push(`- **${d.title}** — ${d.vendor} — ${d.reason}`);
    }
    lines.push("");
  }

  if (report.productsFlagged.length) {
    lines.push("## Held for review — imported but hidden from the public site", "");
    lines.push(
      "Each of these is in the database with status `FLAGGED`. Nothing is lost.",
      "To publish one, change its status to `PUBLISHED`.",
      "",
    );
    for (const f of report.productsFlagged) {
      lines.push(`- **${f.title}** — ${f.vendor} — ${f.reason}`);
    }
    lines.push("");
  }

  if (report.usersFlagged.length) {
    lines.push("## Accounts that look like test accounts", "");
    lines.push(
      "Imported as normal vendors, but their products were held for review.",
      "",
    );
    for (const u of report.usersFlagged) {
      lines.push(`- \`${u.login}\` — ${u.reason}`);
    }
    lines.push("");
  }

  if (report.upgradedToOriginal.length || report.noOriginalAvailable.length) {
    lines.push("## Download quality", "");
    lines.push(
      "WordPress automatically downscales uploads over 2560px and serves a",
      '`-scaled` copy. The old site sold that downscale. These products now',
      "deliver the creator's original file instead.",
      "",
    );
    lines.push(
      `**${report.upgradedToOriginal.length} paid files upgraded to full resolution.**`,
      "",
    );
    for (const u of report.upgradedToOriginal.slice(0, 60)) {
      lines.push(`- ${u.product} — \`${u.from}\` → \`${u.to}\``);
    }
    if (report.upgradedToOriginal.length > 60) {
      lines.push(`- …and ${report.upgradedToOriginal.length - 60} more`);
    }
    lines.push("");
    if (report.noOriginalAvailable.length) {
      lines.push(
        `${report.noOriginalAvailable.length} downscaled files had no recoverable original and ship unchanged.`,
        "",
      );
    }
  }

  if (report.missingMedia.length) {
    lines.push("## Missing media", "");
    lines.push(
      "These files could not be fetched from the old host. **Retry `npm run migrate:media` while paywhatyouwant.io is still online** — once that hosting lapses they are unrecoverable.",
      "",
    );
    for (const m of report.missingMedia.slice(0, 200)) {
      lines.push(`- ${m.product} — \`${m.url}\``);
    }
    if (report.missingMedia.length > 200) {
      lines.push(`- …and ${report.missingMedia.length - 200} more`);
    }
    lines.push("");
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, lines.join("\n"), "utf8");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
