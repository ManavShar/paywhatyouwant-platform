/**
 * Stage 1 of 3 — read the WXR export into migration/manifest.json.
 *
 *   npm run migrate:parse
 *
 * Touches nothing but the filesystem. Safe to re-run.
 */

import fs from "node:fs";
import path from "node:path";
import { parseWordpressExport } from "./lib/wp-parse";

const EXPORT_GLOB_DIR = path.resolve(process.cwd(), "..");
const OUT_DIR = path.resolve(process.cwd(), "migration");

function findExportFile(): string {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);

  const candidates = fs
    .readdirSync(EXPORT_GLOB_DIR)
    .filter((f) => f.endsWith(".xml") && f.toLowerCase().includes("wordpress"))
    .map((f) => path.join(EXPORT_GLOB_DIR, f));

  if (candidates.length === 0) {
    throw new Error(
      `No WordPress export found in ${EXPORT_GLOB_DIR}. Pass the path as an argument.`,
    );
  }
  // Newest export wins if there are several.
  return candidates.sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  )[0];
}

function main() {
  const sourceFile = findExportFile();
  console.log(`Reading ${sourceFile}`);

  const xml = fs.readFileSync(sourceFile, "utf8");
  const manifest = parseWordpressExport(xml, sourceFile);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");

  const withFiles = manifest.products.filter((p) => p.files.length > 0).length;
  const withThumb = manifest.products.filter((p) => p.thumbnailId).length;
  const withPreview = manifest.products.filter(
    (p) => p.previewAttachmentIds.length > 0,
  ).length;

  console.log(`
  users        ${manifest.users.length}
  products     ${manifest.products.length}
    with file  ${withFiles}
    with cover ${withThumb}
    w/ preview ${withPreview}
  attachments  ${manifest.attachments.length}

  → ${outPath}`);
}

main();
