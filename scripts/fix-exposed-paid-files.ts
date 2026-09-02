import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveCover } from "../src/lib/images";
import { swapExtension } from "../src/lib/storage";

/**
 * Removes paid files from the public tree.
 *
 * The WordPress import attached one file to a product twice — as the paid
 * download and as the public cover — so for 44 products the "preview" was
 * byte-identical to the thing being sold, and 22 of those were priced. Anyone
 * who read an image URL had the goods.
 *
 * Three shapes, handled differently:
 *
 *  1. **Image used as its own cover.** A display-sized JPEG is derived from the
 *     original, published under a new key, and the full-resolution copy is
 *     removed from the public tree. The product keeps a cover; the original
 *     stays in `storage/media`, reachable only through a download grant.
 *
 *  2. **Audio that is also the product's preview.** There is no way to make a
 *     30-second clip without an audio toolchain, and publishing the whole
 *     track is the bug. The public copy goes and so does the preview row, so
 *     the page does not point at a file that is no longer there. The creator
 *     can upload a real preview clip whenever they like.
 *
 *  3. **Anything else in the public tree that is a paid file.** Removed.
 *
 * Idempotent: a second run finds nothing to do. Pass `--apply` to write;
 * without it the script only reports.
 */

const APPLY = process.argv.includes("--apply");

const PRIVATE_ROOT = path.join(process.cwd(), "storage", "media");
const PUBLIC_ROOT = path.join(process.cwd(), "storage", "public-media");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Prisma 7 connects through a driver adapter rather than a `url` in the schema.
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

type Action = "derived" | "preview-removed" | "removed" | "cover-cleared" | "skipped";

async function main() {
  const paidFiles = await db.productFile.findMany({
    where: { isPreview: false },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          suggestedPriceCents: true,
          coverImageUrl: true,
        },
      },
    },
  });

  const exposed = paidFiles.filter((f) =>
    fs.existsSync(path.join(PUBLIC_ROOT, f.storageKey)),
  );

  console.log(
    `${paidFiles.length} paid files; ${exposed.length} of them are also in the public tree ` +
      `(${exposed.filter((f) => f.product.suggestedPriceCents > 0).length} priced above $0).`,
  );
  console.log(APPLY ? "Applying changes.\n" : "Dry run — pass --apply to write.\n");

  const tally: Record<Action, number> = {
    derived: 0,
    "preview-removed": 0,
    removed: 0,
    "cover-cleared": 0,
    skipped: 0,
  };
  const manual: string[] = [];

  for (const file of exposed) {
    const { product } = file;
    const publicPath = path.join(PUBLIC_ROOT, file.storageKey);
    const privatePath = path.join(PRIVATE_ROOT, file.storageKey);
    const isCover = product.coverImageUrl === `/media/${file.storageKey}`;

    // The paid original must exist privately before anything is deleted
    // publicly, or the fix would destroy the only copy of the file.
    if (!fs.existsSync(privatePath)) {
      console.log(`  SKIP  ${product.slug} — no private copy, leaving alone`);
      tally.skipped += 1;
      manual.push(`${product.slug}: paid file exists only in the public tree`);
      continue;
    }

    if (isCover) {
      const derived = await deriveCover(await fsp.readFile(privatePath));

      if (derived) {
        const newKey = swapExtension(
          `covers/${file.storageKey}`,
          derived.extension,
        );
        const dest = path.join(PUBLIC_ROOT, newKey);

        if (APPLY) {
          await fsp.mkdir(path.dirname(dest), { recursive: true });
          await fsp.writeFile(dest, derived.buffer);
          await db.product.update({
            where: { id: product.id },
            data: { coverImageUrl: `/media/${newKey}` },
          });
          await fsp.rm(publicPath, { force: true });
        }

        const before = fs.statSync(privatePath).size;
        console.log(
          `  COVER ${product.slug}\n` +
            `        ${(before / 1024).toFixed(0)}KB original -> ` +
            `${(derived.buffer.length / 1024).toFixed(0)}KB at ${derived.width}x${derived.height}`,
        );
        tally.derived += 1;
        continue;
      }

      // Cannot decode it, so cannot prove a published copy is a reduction.
      // Removing the cover is worse-looking and safer than leaving the paid
      // file on public display.
      if (APPLY) {
        await db.product.update({
          where: { id: product.id },
          data: { coverImageUrl: null },
        });
        await fsp.rm(publicPath, { force: true });
      }
      console.log(
        `  CLEAR ${product.slug} — .${file.extension} cannot be resized here; cover removed`,
      );
      tally["cover-cleared"] += 1;
      manual.push(
        `${product.slug}: needs a new cover uploaded (.${file.extension} could not be reduced)`,
      );
      continue;
    }

    // Not the cover. Is this same file doing duty as the preview?
    const previewRow = await db.productFile.findFirst({
      where: { productId: product.id, isPreview: true, storageKey: file.storageKey },
    });

    if (previewRow) {
      if (APPLY) {
        await db.productFile.delete({ where: { id: previewRow.id } });
        await fsp.rm(publicPath, { force: true });
      }
      console.log(
        `  PREVIEW ${product.slug} — the whole paid track was the preview; preview removed`,
      );
      tally["preview-removed"] += 1;
      manual.push(`${product.slug}: lost its preview, a real clip could be uploaded`);
      continue;
    }

    if (APPLY) await fsp.rm(publicPath, { force: true });
    console.log(`  REMOVE ${product.slug} — paid file was public for no reason`);
    tally.removed += 1;
  }

  /*
   * Second pass: covers that are the paid file under a different name.
   *
   * The first pass matches on storage key, which catches the import's habit of
   * attaching one row twice. It does not catch a creator who simply uploaded
   * the same photograph twice — once as the product, once as the cover — since
   * that produces two keys holding identical bytes. The client's own test
   * product was exactly this: a $2.99 photograph whose public cover was a
   * byte-for-byte copy of the thing being sold.
   *
   * Compared by hash rather than by key. Only the cover is replaced; the paid
   * file is untouched.
   */
  const withCovers = await db.product.findMany({
    where: { coverImageUrl: { not: null } },
    include: { files: { where: { isPreview: false } } },
  });

  let identicalCovers = 0;
  for (const product of withCovers) {
    const paid = product.files[0];
    if (!paid) continue;

    const coverKey = product.coverImageUrl!.replace(/^\/media\//, "");
    const coverPath = path.join(PUBLIC_ROOT, coverKey);
    const paidPath = path.join(PRIVATE_ROOT, paid.storageKey);
    if (!fs.existsSync(coverPath) || !fs.existsSync(paidPath)) continue;

    if (sha256(coverPath) !== sha256(paidPath)) continue;

    const derived = await deriveCover(await fsp.readFile(paidPath));
    if (!derived) {
      console.log(
        `  MANUAL ${product.slug} — cover is the paid file and cannot be resized here`,
      );
      manual.push(`${product.slug}: cover duplicates the paid file, needs replacing by hand`);
      continue;
    }

    const newKey = swapExtension(`covers/${paid.storageKey}`, derived.extension);
    if (APPLY) {
      const dest = path.join(PUBLIC_ROOT, newKey);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, derived.buffer);
      await db.product.update({
        where: { id: product.id },
        data: { coverImageUrl: `/media/${newKey}` },
      });
      // Only remove the old cover if nothing else points at it.
      const stillUsed = await db.product.count({
        where: { coverImageUrl: `/media/${coverKey}` },
      });
      if (stillUsed === 0) await fsp.rm(coverPath, { force: true });
    }

    console.log(
      `  DUPLICATE ${product.slug} — cover was the paid file; replaced with a ` +
        `${derived.width}x${derived.height} rendition`,
    );
    identicalCovers += 1;
  }
  if (identicalCovers) {
    console.log(`  (${identicalCovers} covers were copies of the paid file)`);
  }

  /*
   * Third pass: previews that are the paid file under a different name.
   *
   * Same shape as the cover case above and the same cause — the file uploaded
   * twice — but a preview rather than a cover. For an image it becomes a
   * rendition; audio cannot be shortened without a toolchain, so the row goes
   * and the creator can upload a real clip.
   */
  const previewDupes = await db.product.findMany({
    include: { files: true },
  });

  let dupePreviews = 0;
  for (const product of previewDupes) {
    const paid = product.files.find((f) => !f.isPreview);
    const preview = product.files.find((f) => f.isPreview);
    if (!paid || !preview) continue;
    if (preview.storageKey === paid.storageKey) continue; // first pass owns this

    const previewPath = path.join(PUBLIC_ROOT, preview.storageKey);
    const paidPath = path.join(PRIVATE_ROOT, paid.storageKey);
    if (!fs.existsSync(previewPath) || !fs.existsSync(paidPath)) continue;
    if (sha256(previewPath) !== sha256(paidPath)) continue;

    const derived = await deriveCover(await fsp.readFile(paidPath));

    if (derived) {
      const newKey = swapExtension(
        `previews/${preview.storageKey}`,
        derived.extension,
      );
      if (APPLY) {
        const dest = path.join(PUBLIC_ROOT, newKey);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, derived.buffer);
        await db.productFile.update({
          where: { id: preview.id },
          data: {
            storageKey: newKey,
            extension: derived.extension,
            mimeType: derived.mimeType,
            sizeBytes: derived.buffer.length,
          },
        });
        await fsp.rm(previewPath, { force: true });
      }
      console.log(
        `  PREVIEW-DUP ${product.slug} — preview was the paid file; now a ` +
          `${derived.width}x${derived.height} rendition`,
      );
    } else {
      if (APPLY) {
        await db.productFile.delete({ where: { id: preview.id } });
        await fsp.rm(previewPath, { force: true });
      }
      console.log(
        `  PREVIEW-DUP ${product.slug} — preview was the paid file and cannot be reduced; removed`,
      );
      manual.push(`${product.slug}: preview removed, a real clip could be uploaded`);
    }
    dupePreviews += 1;
  }
  if (dupePreviews) {
    console.log(`  (${dupePreviews} previews were copies of the paid file)`);
  }

  /*
   * Fourth pass: preview rows left pointing at nothing.
   *
   * A product could have the same file registered three ways at once — paid
   * download, cover, and "preview" — and the first pass only looked for the
   * preview duplicate on products where the file was *not* the cover. On the
   * 23 products where it was both, the public copy was removed and the preview
   * row was left dangling.
   *
   * Deleting the row is the right end state, not repointing it: that "preview"
   * was never a preview, it was the paid file on public display, which is the
   * whole thing being fixed here.
   */
  const previews = await db.productFile.findMany({
    where: { isPreview: true },
    include: { product: { select: { id: true, slug: true } } },
  });

  let orphanedPreviews = 0;
  for (const preview of previews) {
    if (fs.existsSync(path.join(PUBLIC_ROOT, preview.storageKey))) continue;

    // Only if this key is genuinely the product's paid file. A preview missing
    // for any other reason is a different problem and not ours to delete.
    const alsoPaid = await db.productFile.findFirst({
      where: {
        productId: preview.productId,
        isPreview: false,
        storageKey: preview.storageKey,
      },
    });
    if (!alsoPaid) continue;

    if (APPLY) await db.productFile.delete({ where: { id: preview.id } });
    console.log(
      `  ORPHAN ${preview.product.slug} — preview row pointed at the withdrawn paid file`,
    );
    orphanedPreviews += 1;
  }
  if (orphanedPreviews) {
    console.log(`  (${orphanedPreviews} dangling preview rows)`);
  }

  console.log("\nSummary");
  for (const [k, v] of Object.entries(tally)) {
    if (v) console.log(`  ${k.padEnd(16)} ${v}`);
  }

  if (manual.length) {
    console.log("\nWorth a human look:");
    for (const m of manual) console.log(`  - ${m}`);
  }

  if (APPLY) {
    const still = (
      await db.productFile.findMany({ where: { isPreview: false } })
    ).filter((f) => fs.existsSync(path.join(PUBLIC_ROOT, f.storageKey)));
    console.log(
      `\nVerification: ${still.length} paid files remain in the public tree.`,
    );
  }
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
