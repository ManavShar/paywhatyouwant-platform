import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { PUBLIC_ROOT, extensionOf } from "@/lib/storage";

/**
 * Serves the public media tree.
 *
 * This exists because `public/` is not a runtime directory. `next build`
 * snapshots it and `next start` serves only what it saw at build time, so
 * every cover image, audio preview, avatar and post image uploaded after a
 * deploy returned 404 in production while working under `next dev` — which is
 * exactly how it reached a client with a published product and no picture.
 * Reading the disk per request is the whole point of this handler; do not
 * "simplify" it back into a static directory.
 *
 * It reads `storage/public-media` and nothing else. The sibling tree
 * `storage/media` holds every paid file, and many migrated keys there are
 * guessable WordPress paths (`2018/08/beach-photos-2.jpg`) — while this route
 * is deliberately exempt from the preview password so `next/image` can fetch
 * through it (`src/proxy.ts`). Pointing this at the private root would hand
 * out the entire paid catalogue to anyone who guessed a filename.
 */

/**
 * Extensions we serve, and what we call them.
 *
 * An allowlist rather than a lookup with a fallback: the response is
 * unauthenticated and cross-origin-readable, so an unknown extension should be
 * a 404 rather than an `application/octet-stream` of something unexpected.
 * `Content-Type` cannot come from the database — legacy migrated keys have no
 * `ProductFile` row of their own.
 *
 * **SVG is deliberately absent.** `image/svg+xml` served from this origin is
 * executable: an SVG can carry a `<script>` and would run with the site's
 * cookies. No upload path can currently put one in the public tree — covers
 * and previews accept raster images and audio only — so this is defence
 * against a future change to `ALLOWED_IMAGE`, not a fix for a live hole. If
 * SVG covers are ever wanted, serve them from a separate origin or strip the
 * scripting first; do not simply add the line back.
 */
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(
  request: Request,
  context: RouteContext<"/media/[...key]">,
) {
  const { key } = await context.params;
  const relative = key.join("/");

  const absolute = path.join(PUBLIC_ROOT, relative);

  // Defence in depth. The segments come straight off the URL, and this is the
  // one place where being wrong reads arbitrary files off the disk.
  if (!path.resolve(absolute).startsWith(path.resolve(PUBLIC_ROOT))) {
    return notFound();
  }

  const contentType = CONTENT_TYPES[extensionOf(relative)];
  if (!contentType) return notFound();

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();

  // Keys carry a random nonce and are never reused, so what lives at a given
  // key cannot change. Immutable is honest here, and it matters: this route is
  // hit for every thumbnail on the wall.
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    // Tells the browser it may ask for a byte range — without it Safari will
    // not seek an audio file at all.
    "Accept-Ranges": "bytes",
  };

  /**
   * Range handling.
   *
   * The static file server did this for free and the audio player depends on
   * it: without a 206 the preview cannot be scrubbed, and Safari refuses to
   * begin playback of a range-less audio response.
   */
  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);

  if (match && (match[1] !== "" || match[2] !== "")) {
    const size = stat.size;
    let start: number;
    let end: number;

    if (match[1] === "") {
      // "bytes=-500" — the final 500 bytes.
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const stream = Readable.toWeb(
      fs.createReadStream(absolute, { start, end }),
    ) as ReadableStream;

    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  // Streamed, not buffered: previews run to tens of megabytes and this route
  // is on the hot path for every page with a picture on it.
  const stream = Readable.toWeb(
    fs.createReadStream(absolute),
  ) as ReadableStream;

  return new NextResponse(stream, {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
