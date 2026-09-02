/**
 * Upload ceiling, in a module with no Node imports.
 *
 * `storage.ts` pulls in `node:fs`, so the upload form — a client component that
 * needs to refuse an oversized file before submitting it — cannot import the
 * limit from there. It lives here and both sides read the same number.
 *
 * Kept just under the 50MB `serverActions.bodySizeLimit` in `next.config.ts`.
 * Uploads arrive through a Server Action, and the framework rejects an
 * oversized body *before* any of our code runs; leaving room for the boundary
 * and part headers that multipart adds means a too-large file comes back with
 * our message rather than a generic failure. Raising it means raising both,
 * and past ~50MB it means streaming to disk instead of buffering the file in
 * memory (see `storeUpload`).
 */
export const MAX_UPLOAD_BYTES = 48 * 1024 * 1024; // 48 MB

export const MAX_UPLOAD_LABEL = "48 MB";

/**
 * Ceiling for the streaming upload route, which is a different animal.
 *
 * `/api/upload` is a route handler, so `serverActions.bodySizeLimit` does not
 * apply to it, and it pipes the request body straight to disk instead of
 * reading it into memory. That removes both reasons the number above is small,
 * so this one is a deliberate product decision rather than a framework
 * accident.
 *
 * 200MB covers a lossless audio track, a long podcast episode and a large
 * video, which is what albums actually contain. The album builder uploads one
 * file per request precisely so this limit applies per track rather than to
 * the whole collection — a ten-track album is roughly 78MB in total and could
 * never have gone through a single Server Action.
 */
export const MAX_STREAM_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

export const MAX_STREAM_UPLOAD_LABEL = "200 MB";
