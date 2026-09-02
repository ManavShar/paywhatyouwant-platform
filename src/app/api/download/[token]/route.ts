import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { checkGrant, recordDownload } from "@/lib/downloads";

/**
 * The only route that can serve a paid file.
 *
 * Paid assets live in `storage/media`, outside the public tree, so this
 * handler is the sole path to them. It streams rather than buffering, because
 * some of the migrated podcast files are 25MB+ and reading those into memory
 * per request would be indefensible.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/download/[token]">,
) {
  const { token } = await context.params;

  const result = await checkGrant(token);
  if (!result.ok) {
    const message =
      result.reason === "revoked"
        ? "This purchase was refunded, so the download is no longer available."
        : result.reason === "expired"
          ? "This download link has expired."
          : result.reason === "exhausted"
            ? "This download link has been used the maximum number of times."
            : "Download link not found.";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  const file = result.grant.product.files[0];
  if (!file) {
    return NextResponse.json(
      { error: "No file is attached to this product." },
      { status: 404 },
    );
  }

  const storageRoot = path.join(process.cwd(), "storage", "media");
  const absolute = path.join(storageRoot, file.storageKey);

  // Defence in depth: a storageKey should never escape the storage root, but
  // this is the one place where being wrong hands out arbitrary files.
  if (!path.resolve(absolute).startsWith(path.resolve(storageRoot))) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }
  if (!fs.existsSync(absolute)) {
    return NextResponse.json(
      { error: "The file is missing from storage." },
      { status: 404 },
    );
  }

  await recordDownload(result.grant.id);

  const stat = fs.statSync(absolute);
  const stream = Readable.toWeb(
    fs.createReadStream(absolute),
  ) as ReadableStream;

  // Quote the filename: many migrated names contain spaces and accents.
  const safeName = file.fileName.replace(/"/g, "");

  return new NextResponse(stream, {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
