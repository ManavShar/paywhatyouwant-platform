import { Jimp } from "jimp";

/**
 * Deriving a public cover from a private original.
 *
 * The WordPress import attached one file to a product twice: as the thing you
 * pay for *and* as the cover shown to everyone. So for 44 products the public
 * "preview" was byte-identical to the paid download — 22 of them priced, all
 * of them free to anyone who read the image URL. That is not a leak through a
 * clever attack; it is the shop handing out the goods.
 *
 * The rule this enforces: **a public cover is always a reduced rendition,
 * never the original bytes.** A creator who wants to show their work at full
 * resolution can still do it — by pricing it at zero, which is what this site
 * is for — but it must be a decision rather than an accident of import.
 *
 * `jimp` rather than `sharp`: sharp is faster and handles more formats, but it
 * ships a native binary, and on the machine this was built on that binary is
 * blocked outright by a Windows Application Control policy. A pure-JavaScript
 * decoder works everywhere, which for a step that sits in the upload path
 * matters more than speed.
 */

/**
 * Longest edge of a derived cover, in pixels.
 *
 * The product page renders covers at 1200px wide, so this is the largest size
 * that is ever actually displayed — anything bigger would be download-quality
 * dressed up as a preview.
 */
export const COVER_MAX_EDGE = 1200;

/**
 * A cover is also capped as a *proportion* of the original, not just at an
 * absolute size.
 *
 * The absolute cap alone is only a reduction for large images. Several
 * migrated products are sold at 400–900px, and for those, resizing "down to
 * 1200" changes nothing — the public cover would still be the product. Taking
 * three quarters of the long edge (a bit over half the pixels) means every
 * cover is visibly smaller than what is being sold, whatever the original was.
 */
const COVER_MAX_FRACTION = 0.75;

const COVER_QUALITY = 82;

/** Formats `jimp` can decode. webp and avif are notably absent. */
const DECODABLE = new Set(["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif"]);

export function canDeriveCover(extension: string | null | undefined): boolean {
  return DECODABLE.has((extension ?? "").toLowerCase());
}

export type DerivedCover = {
  buffer: Buffer;
  width: number;
  height: number;
  /** Always jpeg — one output format keeps the media route's allowlist small. */
  extension: "jpg";
  mimeType: "image/jpeg";
};

/**
 * Produces a display-sized JPEG from image bytes.
 *
 * Returns null when the format cannot be decoded, so callers can decide: the
 * upload path refuses the cover, and the remediation script reports the file
 * for a human rather than guessing.
 *
 * Every image is re-encoded, even a small one. Re-encoding strips EXIF —
 * which on a photograph routinely carries the camera serial and the GPS
 * coordinates of where it was taken — and that is worth doing on its own.
 */
export async function deriveCover(input: Buffer): Promise<DerivedCover | null> {
  try {
    const image = await Jimp.read(input);

    const longEdge = Math.max(image.bitmap.width, image.bitmap.height);
    // Whichever bites harder: the absolute ceiling, or three quarters of what
    // was uploaded. Floored so a tiny image cannot round back up to itself.
    const target = Math.max(
      1,
      Math.min(COVER_MAX_EDGE, Math.floor(longEdge * COVER_MAX_FRACTION)),
    );
    if (target < longEdge) {
      image.scaleToFit({ w: target, h: target });
    }

    const buffer = await image.getBuffer("image/jpeg", { quality: COVER_QUALITY });

    return {
      buffer: Buffer.from(buffer),
      width: image.bitmap.width,
      height: image.bitmap.height,
      extension: "jpg",
      mimeType: "image/jpeg",
    };
  } catch {
    return null;
  }
}
