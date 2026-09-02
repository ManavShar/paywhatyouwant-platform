import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { signUploadKey } from "@/lib/upload-token";
import { limit } from "@/lib/rate-limit";
import {
  storeStream,
  extensionOf,
  ALLOWED_COVER,
  ALLOWED_IMAGE,
  ALLOWED_PRODUCT,
  ALLOWED_AUDIO,
  MAX_STREAM_UPLOAD_LABEL,
} from "@/lib/storage";

/**
 * Streaming upload for one file.
 *
 * Everything else on the site uploads through a Server Action, which caps the
 * request body at 48MB because `storeUpload` reads the file into memory. That
 * is survivable for a single photograph and impossible for an album: ten audio
 * tracks come to roughly 78MB, twenty photographs to roughly 50MB, and no
 * tuning of that cap makes a whole collection fit in one request.
 *
 * So the album builder posts one file at a time here instead. A route handler
 * is not subject to `serverActions.bodySizeLimit`, and the body is piped
 * straight to disk, so memory use does not track file size and the limit
 * becomes a decision rather than a constraint.
 *
 * The file is written and its key returned; nothing is committed to the
 * database until the builder submits the album. An abandoned upload leaves a
 * stray file rather than a half-built album, which is the right way round.
 */

/** Which extensions are acceptable, by what the file is for. */
const ROLES = {
  product: { allowed: ALLOWED_PRODUCT, visibility: "private", label: "file" },
  cover: { allowed: ALLOWED_COVER, visibility: "public", label: "cover image" },
  preview: {
    allowed: new Set([...ALLOWED_AUDIO, ...ALLOWED_IMAGE]),
    visibility: "public",
    label: "preview",
  },
} as const;

export async function POST(request: Request) {
  // A Server Action gets its identity check for free; a route handler does
  // not, and this one writes to disk. Unauthenticated upload would be an open
  // file drop.
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return NextResponse.json(
      { error: "You need a creator account to upload." },
      { status: 403 },
    );
  }

  // Keyed by user, not address: this route is authenticated, so the account
  // is the thing that cannot be swapped. The ceiling is high enough that a
  // creator uploading a long album never meets it, and low enough that a
  // compromised session cannot fill the disk overnight.
  const gate = await limit("upload", user.id);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many uploads in a short time. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role") ?? "product";
  const role = ROLES[roleParam as keyof typeof ROLES];
  if (!role) {
    return NextResponse.json({ error: "Unknown upload role" }, { status: 400 });
  }

  const fileName = url.searchParams.get("name")?.trim();
  if (!fileName) {
    return NextResponse.json({ error: "Missing file name" }, { status: 400 });
  }

  const extension = extensionOf(fileName);
  if (!role.allowed.has(extension)) {
    // Covers are deliberately narrower than the general image list, so a flat
    // refusal here reads as a bug. Name the formats that work.
    return NextResponse.json(
      {
        error:
          roleParam === "cover"
            ? "A cover image has to be a JPEG, PNG or GIF."
            : `We can't accept a .${extension} file. Images, audio, PDF, ePub, video and ZIP all work.`,
      },
      { status: 415 },
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }

  try {
    const stored = await storeStream(
      request.body,
      fileName,
      role.visibility,
      request.headers.get("content-type"),
      // Album covers come through this route rather than a Server Action, so
      // without this they would be published at full resolution while product
      // covers were being reduced — the same hole, reopened on the newer path.
      { as: roleParam === "cover" ? "cover" : undefined },
    );

    if (stored.sizeBytes === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }

    // The builder hands these keys back to a Server Action, which is a public
    // endpoint — the signature is what stops someone attaching a file they do
    // not own. See `src/lib/upload-token.ts`.
    return NextResponse.json({
      ...stored,
      token: signUploadKey({
        userId: user.id,
        storageKey: stored.storageKey,
        visibility: role.visibility,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNSUPPORTED_COVER")) {
      return NextResponse.json(
        { error: "A cover image has to be a JPEG, PNG or GIF." },
        { status: 415 },
      );
    }
    if (err instanceof Error && err.message.includes("TOO_LARGE")) {
      return NextResponse.json(
        { error: `That file is over the ${MAX_STREAM_UPLOAD_LABEL} limit.` },
        { status: 413 },
      );
    }
    console.error("upload failed", err);
    return NextResponse.json(
      { error: "Something went wrong receiving that file." },
      { status: 500 },
    );
  }
}
