import crypto from "node:crypto";

/**
 * Proof that this server wrote this file, for this user, in this role.
 *
 * The album builder uploads each file to `/api/upload` and then submits the
 * returned storage keys to a Server Action, which attaches them to database
 * rows. Without a check, that second request is a plain list of file paths
 * from the browser — and a Server Action is a public POST endpoint. Someone
 * could post `2018/08/whatever.jpg`, a key belonging to another creator's paid
 * file, and publish it as their own for sale. The keys of migrated files are
 * guessable WordPress paths, so this is not a theoretical attack.
 *
 * The token binds the key to the uploader and to whether the file was written
 * to the public or the private tree, so a private paid file cannot be
 * re-submitted as a public preview either. It is not a secret and does not
 * need to expire — it only asserts provenance, and the underlying file is
 * already unreachable to anyone who does not know its random key.
 */

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    // Failing loudly is right: silently signing with a constant would make
    // every token forgeable by anyone who read this file.
    throw new Error("AUTH_SECRET is required to sign uploads");
  }
  return value;
}

export function signUploadKey(parts: {
  userId: string;
  storageKey: string;
  visibility: "public" | "private";
}): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`${parts.userId}:${parts.storageKey}:${parts.visibility}`)
    .digest("base64url");
}

export function verifyUploadKey(
  token: string,
  parts: { userId: string; storageKey: string; visibility: "public" | "private" },
): boolean {
  const expected = signUploadKey(parts);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
