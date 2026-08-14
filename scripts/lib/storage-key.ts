/**
 * Maps a WordPress upload URL onto a local storage key, preserving the
 * /YYYY/MM/filename layout. WordPress already guarantees uniqueness within a
 * month folder, so this stays collision-free while leaving the tree readable.
 *
 * Lives in its own module because both the downloader and the importer need
 * it, and importing it from the downloader would re-run that script's `main()`.
 */
export function storageKeyFor(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const marker = "/wp-content/uploads/";
  const idx = pathname.indexOf(marker);
  const relative =
    idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\/+/, "");

  // Defuse traversal and decode %20 etc. so filenames on disk stay readable.
  const safe = relative
    .split("/")
    .map((seg) => decodeURIComponent(seg).replace(/[<>:"|?*\\]/g, "_"))
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");

  return safe || "misc/unnamed";
}
