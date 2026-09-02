import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_STREAM_UPLOAD_BYTES } from "./upload-limits";
import { deriveCover } from "./images";

/**
 * Vendor uploads.
 *
 * Two trees, and the split between them is the access-control rule — not a
 * tidying convention. Nothing else decides whether a file may be handed out:
 *
 *   storage/media/…         private. Paid files live here and are reachable
 *                           only through a signed grant, via
 *                           `/api/download/[token]`.
 *   storage/public-media/…  cover images, free previews, avatars and post
 *                           images. Served at `/media/<key>` by
 *                           `src/app/media/[...key]/route.ts`.
 *
 * **The public tree deliberately does not live in `public/`.** `next build`
 * snapshots that directory and `next start` serves only what was in it when
 * the build ran, so every file written at runtime came back 404 in production
 * while working perfectly under `next dev`. A creator uploaded a product and
 * its cover was simply missing. Anything written here after a build must be
 * served by a route handler that reads the disk per request; putting this tree
 * back under `public/` reintroduces that bug silently.
 *
 * Keys are `uploads/<year>/<month>/<random>-<safe-name>` so two vendors
 * uploading "cover.jpg" on the same day cannot collide, and so a guessed URL
 * cannot enumerate anyone's files.
 */

const PRIVATE_ROOT = path.join(process.cwd(), "storage", "media");
export const PUBLIC_ROOT = path.join(process.cwd(), "storage", "public-media");

/** Extensions we will accept, by role. Anything else is refused outright. */
export const ALLOWED_IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

/**
 * What a **cover** may be, which is narrower than what an image may be.
 *
 * A cover is published at full public reach, so it is always re-encoded down
 * to display size first (see `deriveCover`). webp and avif are excluded for
 * exactly one reason: the pure-JavaScript decoder cannot read them, so we
 * could not guarantee the published file was a reduction rather than the
 * original — and an un-reducible cover on a paid product is how 44 works ended
 * up being given away. Accepting a format we can shrink is a smaller cost than
 * publishing one we cannot.
 */
export const ALLOWED_COVER = new Set(["jpg", "jpeg", "png", "gif"]);
export const ALLOWED_AUDIO = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);
/**
 * What may be *sold*. Wider than what may be displayed, because a paid file is
 * only ever stored and streamed back — nothing here has to decode it.
 *
 * `heic`/`heif` matter more than they look: that is what an iPhone saves a
 * photograph as by default, and this is a photography marketplace. Refusing
 * them turned "drag the photo across from my Mac" into a dead end for the
 * format most of the world's photographs are now in. They are deliberately
 * absent from `ALLOWED_IMAGE` and `ALLOWED_COVER`, since we cannot render or
 * shrink one — a creator uploading a HEIC still needs an ordinary JPEG or PNG
 * for the cover.
 */
export const ALLOWED_PRODUCT = new Set([
  ...ALLOWED_IMAGE,
  ...ALLOWED_AUDIO,
  "heic",
  "heif",
  "pdf",
  "epub",
  "zip",
  "mp4",
  "mov",
  "psd",
  "ai",
  "svg",
]);

// Re-exported so server code has one import for storage concerns; the number
// itself lives in a Node-free module the upload form can also read.
export {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  MAX_STREAM_UPLOAD_BYTES,
  MAX_STREAM_UPLOAD_LABEL,
} from "./upload-limits";

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
 * `visibility: "public"` also copies it into the publicly-served tree — used
 * for cover images and free previews. Paid files must always be "private":
 * being in `storage/public-media` is what makes a file world-readable, so a
 * paid file copied there is a paid file given away.
 */
export async function storeUpload(
  file: File,
  visibility: "public" | "private",
  options: { as?: "cover" } = {},
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
  let publicExtension = extensionOf(file.name);
  let publicMime: string | null = file.type || null;
  let publicSize = bytes.length;

  if (visibility === "public") {
    // A cover is published as a reduced rendition, never as the bytes that
    // were uploaded. Copying the original is what made the paid file and the
    // free preview the same thing for 44 migrated products.
    const derived = options.as === "cover" ? await deriveCover(bytes) : null;

    if (options.as === "cover" && !derived) {
      // Refuse rather than fall back to copying: a silent fallback here
      // reintroduces the exact bug, and does it invisibly.
      await fsp.rm(dest, { force: true });
      throw new Error("UNSUPPORTED_COVER");
    }

    const publicKey = derived ? swapExtension(key, derived.extension) : key;
    const pub = path.join(PUBLIC_ROOT, publicKey);
    await fsp.mkdir(path.dirname(pub), { recursive: true });

    if (derived) {
      await fsp.writeFile(pub, derived.buffer);
      publicExtension = derived.extension;
      publicMime = derived.mimeType;
      publicSize = derived.buffer.length;
    } else {
      await fsp.copyFile(dest, pub);
    }

    publicUrl = `/media/${publicKey}`;
  }

  return {
    storageKey: key,
    fileName: safeFileName(file.name),
    sizeBytes: publicSize,
    extension: publicExtension,
    mimeType: publicMime,
    publicUrl,
  };
}

/** `uploads/2026/08/ab12-photo.png` -> `uploads/2026/08/ab12-photo.jpg` */
export function swapExtension(key: string, extension: string): string {
  return key.replace(/\.[^./]+$/, "") + "." + extension;
}


/**
 * Writes an upload straight from a request body to disk, without buffering.
 *
 * `storeUpload` above reads the whole file into memory, which is why the
 * Server Action path is capped at 48MB. Albums broke that: a ten-track album
 * is around 78MB and a twenty-photo set around 50MB, so the collection cannot
 * go through one Server Action however the limit is tuned. The album builder
 * therefore posts one file per request to `/api/upload`, and this is what
 * receives it — memory use stays flat regardless of file size.
 *
 * The byte counter is a guard, not a formality: `Content-Length` is supplied
 * by the client and a truncated or lying header must not be able to fill the
 * disk. Exceeding the limit aborts the stream and removes the partial file.
 */
export async function storeStream(
  body: ReadableStream<Uint8Array>,
  fileName: string,
  visibility: "public" | "private",
  declaredType?: string | null,
  options: { as?: "cover" } = {},
): Promise<StoredFile> {
  const key = buildKey(fileName);
  const dest = path.join(PRIVATE_ROOT, key);

  if (!path.resolve(dest).startsWith(path.resolve(PRIVATE_ROOT))) {
    throw new Error("Invalid file name");
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });

  let sizeBytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sizeBytes += chunk.byteLength;
      if (sizeBytes > MAX_STREAM_UPLOAD_BYTES) {
        throw new Error("TOO_LARGE");
      }
      controller.enqueue(chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body.pipeThrough(counter) as never),
      fs.createWriteStream(dest),
    );
  } catch (err) {
    // A half-written file is worse than none: it would be served, or sold.
    await fsp.rm(dest, { force: true });
    throw err;
  }

  let publicUrl: string | null = null;
  let publicExtension = extensionOf(fileName);
  let publicMime: string | null = declaredType || null;
  let publicSize = sizeBytes;

  if (visibility === "public") {
    // The file is already on disk, so a cover is derived by reading it back
    // rather than by holding it in memory — which is the whole reason this
    // function streams in the first place.
    const derived =
      options.as === "cover" ? await deriveCover(await fsp.readFile(dest)) : null;

    if (options.as === "cover" && !derived) {
      await fsp.rm(dest, { force: true });
      throw new Error("UNSUPPORTED_COVER");
    }

    const publicKey = derived ? swapExtension(key, derived.extension) : key;
    const pub = path.join(PUBLIC_ROOT, publicKey);
    await fsp.mkdir(path.dirname(pub), { recursive: true });

    if (derived) {
      await fsp.writeFile(pub, derived.buffer);
      publicExtension = derived.extension;
      publicMime = derived.mimeType;
      publicSize = derived.buffer.length;
    } else {
      await fsp.copyFile(dest, pub);
    }

    publicUrl = `/media/${publicKey}`;
  }

  return {
    storageKey: key,
    fileName: safeFileName(fileName),
    sizeBytes: publicSize,
    extension: publicExtension,
    mimeType: publicMime,
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
