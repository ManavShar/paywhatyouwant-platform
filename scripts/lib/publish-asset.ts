import fs from "node:fs";
import path from "node:path";

/**
 * Storage is deliberately split in two.
 *
 *   storage/media/…   every file pulled off the old host. Private by default.
 *                     Paid product files live here and ONLY here — they are
 *                     never reachable by URL, only through a signed download
 *                     grant checked against a completed order.
 *
 *   storage/public-media/…  cover images and free previews, copied here at
 *                           import and served by `/media/[...key]`.
 *                     Next serves these as ordinary static files.
 *
 * The alternative — one tree behind a route handler that checks the database
 * per request — would put a query in front of every thumbnail on a masonry
 * page of fifty images. Copying the genuinely-public subset costs some disk
 * and buys static-file performance plus a security boundary you can see.
 */

const PUBLIC_ROOT = path.join(process.cwd(), "storage", "public-media");

export function publishAsset(storageRoot: string, key: string): string | null {
  const source = path.join(storageRoot, key);
  if (!fs.existsSync(source)) return null;

  const dest = path.join(PUBLIC_ROOT, key);

  // Guard against a crafted key escaping the public tree.
  if (!path.resolve(dest).startsWith(path.resolve(PUBLIC_ROOT))) return null;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }

  // URL form, always forward slashes regardless of platform.
  return `/media/${key.split(path.sep).join("/")}`;
}
