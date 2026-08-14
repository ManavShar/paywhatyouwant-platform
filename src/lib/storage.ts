import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Vendor uploads.
 *
 * Mirrors the split the migration established and the download route depends
 * on:
 *
 *   storage/media/…   private. Paid files live here and are reachable only
 *                     through a signed grant.
 *   public/media/…    cover images and free previews, served statically.
 *
 * Keys are `uploads/<year>/<month>/<random>-<safe-name>` so two vendors
 * uploading "cover.jpg" on the same day cannot collide, and so a guessed URL
 * cannot enumerate anyone's files.
 */

const PRIVATE_ROOT = path.join(process.cwd(), "storage", "media");
const PUBLIC_ROOT = path.join(process.cwd(), "public", "media");

/** Extensions we will accept, by role. Anything else is refused outright. */
export const ALLOWED_IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
export const ALLOWED_AUDIO = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
export const ALLOWED_PRODUCT = new Set([
  ...ALLOWED_IMAGE,
  ...ALLOWED_AUDIO,
  "pdf",
  "epub",
  "zip",
  "mp4",
  "mov",
  "psd",
  "ai",
  "svg",
]);

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB

export function extensionOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

/** Strips directory components and anything a filesystem would object to. */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  return (
    base
      .replace(/[<>:"|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "file"
  );
}

function buildKey(fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  // Random prefix, not a sequential id: keys must not be guessable or
  // enumerable, since the private tree's only protection is that nothing
  // outside a grant knows the path.
  const nonce = crypto.randomBytes(8).toString("hex");
  return `uploads/${year}/${month}/${nonce}-${safeFileName(fileName)}`;
}

export type StoredFile = {
  storageKey: string;
  fileName: string;
  sizeBytes: number;
  extension: string;
  mimeType: string | null;
  /** Set only for public files. */
  publicUrl: string | null;
};

/**
 * Writes an uploaded file to disk.
 *
 * `visibility: "public"` also copies it into the statically-served tree —
 * used for cover images and free previews. Paid files must always be
 * "private".
 */
export async function storeUpload(
  file: File,
  visibility: "public" | "private",
): Promise<StoredFile> {
  const key = buildKey(file.name);
  const dest = path.join(PRIVATE_ROOT, key);

  // Defence in depth: a crafted name must never escape the storage root.
  if (!path.resolve(dest).startsWith(path.resolve(PRIVATE_ROOT))) {
    throw new Error("Invalid file name");
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fsp.writeFile(dest, bytes);

  let publicUrl: string | null = null;
  if (visibility === "public") {
    const pub = path.join(PUBLIC_ROOT, key);
    await fsp.mkdir(path.dirname(pub), { recursive: true });
    await fsp.copyFile(dest, pub);
    publicUrl = `/media/${key}`;
  }

  return {
    storageKey: key,
    fileName: safeFileName(file.name),
    sizeBytes: bytes.length,
    extension: extensionOf(file.name),
    mimeType: file.type || null,
    publicUrl,
  };
}

/** Removes a stored file from both trees. Used when an upload half-fails. */
export async function removeUpload(key: string) {
  for (const root of [PRIVATE_ROOT, PUBLIC_ROOT]) {
    const target = path.join(root, key);
    if (!path.resolve(target).startsWith(path.resolve(root))) continue;
    if (fs.existsSync(target)) await fsp.rm(target, { force: true });
  }
}
