/**
 * Stage 2 of 3 — pull every media file off the old WordPress host.
 *
 *   npm run migrate:media
 *
 * This is the time-critical step. The WordPress plugins are not being renewed,
 * so the day that hosting lapses these files are gone and the catalogue is
 * unrecoverable. Everything else in the migration can be redone later; this
 * cannot.
 *
 * Properties that matter:
 *  - Resumable. Re-running skips files already on disk, so an interrupted run
 *    costs nothing. Progress is also journalled to migration/media-state.json.
 *  - Polite. Small fixed concurrency and a per-request delay; we are not
 *    trying to knock over a site we own but no longer control.
 *  - Honest. Failures are recorded and reported, never silently swallowed —
 *    a half-migrated catalogue that claims success is worse than a clear error.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { WpManifest } from "./lib/wp-parse";
import { storageKeyFor } from "./lib/storage-key";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "migration", "manifest.json");
const STATE_FILE = path.join(ROOT, "migration", "media-state.json");
const STORAGE = path.join(ROOT, "storage", "media");

const CONCURRENCY = 4;
const DELAY_MS = 120;
const MAX_ATTEMPTS = 3;
// Covers the WHOLE request including streaming the body, not just the initial
// response. The migrated podcast episodes run to 25MB+ and a 60s budget was
// killing them mid-download on every attempt. Generous is correct here: the
// cost of waiting is a slow script, the cost of giving up is a lost master.
const TIMEOUT_MS = 900_000;

// "gone" means the server says the file no longer exists (404) or refuses to
// serve it (403). Retrying those forever costs a request per run and muddies
// the summary, so they are recorded as permanent and skipped afterwards.
type Status = "ok" | "failed" | "gone";
type StateEntry = { status: Status; key?: string; bytes?: number; error?: string };
type State = Record<string, StateEntry>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

function saveState(state: State) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function downloadOne(url: string): Promise<StateEntry> {
  const key = storageKeyFor(url);
  const dest = path.join(STORAGE, key);

  // Already present and non-empty? Trust it and move on.
  try {
    const stat = await fsp.stat(dest);
    if (stat.size > 0) return { status: "ok", key, bytes: stat.size };
  } catch {
    // not downloaded yet
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Download to a temp name, then rename. A crash mid-write must never
    // leave a truncated file that a later run mistakes for complete.
    const tmp = `${dest}.part`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "paywhatyouwant-migration/1.0" },
        redirect: "follow",
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // Neither improves with retrying, now or on any future run.
        if (res.status === 404 || res.status === 403) {
          return { status: "gone", key, error: lastError };
        }
        await sleep(500 * attempt);
        continue;
      }
      if (!res.body) {
        lastError = "empty response body";
        continue;
      }

      await pipeline(
        Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        fs.createWriteStream(tmp),
      );

      const { size } = await fsp.stat(tmp);
      if (size === 0) {
        await fsp.rm(tmp, { force: true });
        lastError = "zero-byte download";
        continue;
      }

      await fsp.rename(tmp, dest);
      return { status: "ok", key, bytes: size };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await fsp.rm(tmp, { force: true }).catch(() => {});
      await sleep(500 * attempt);
    }
  }

  return { status: "failed", key, error: lastError || "unknown error" };
}

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error("migration/manifest.json not found. Run migrate:parse first.");
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as WpManifest;

  // Every URL worth having: attachment media (covers and previews) plus the
  // purchasable product files, which are not always registered as attachments.
  const urls = new Set<string>();
  for (const a of manifest.attachments) {
    if (a.url) urls.add(a.url);
    // The full-resolution original sitting behind WordPress's "-scaled" copy.
    if (a.originalUrl) urls.add(a.originalUrl);
  }
  for (const p of manifest.products) for (const f of p.files) if (f.url) urls.add(f.url);
  // Images embedded in description HTML, registered nowhere else.
  for (const u of manifest.embeddedUrls ?? []) urls.add(u);
  // Rotated variants and legacy multisite paths — archived, never served.
  for (const u of manifest.altUrls ?? []) urls.add(u);

  const all = [...urls].filter((u) => /^https?:\/\//i.test(u));
  const state = loadState();

  const pending = all.filter(
    (u) => state[u]?.status !== "ok" && state[u]?.status !== "gone",
  );
  const goneCount = all.filter((u) => state[u]?.status === "gone").length;
  console.log(
    `${all.length} referenced, ${all.length - pending.length - goneCount} already local, ` +
      `${goneCount} permanently gone, ${pending.length} to fetch.\n`,
  );

  let done = 0;
  let failed = 0;
  let bytes = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const url = pending[cursor++];
      const result = await downloadOne(url);
      state[url] = result;

      done += 1;
      if (result.status === "ok") {
        bytes += result.bytes ?? 0;
      } else {
        // A "gone" file is reported but not counted as a failure — it is a
        // fact about the old server, not something a retry could fix.
        if (result.status === "failed") failed += 1;
        console.warn(`  ! ${result.error}  ${url}`);
      }

      if (done % 25 === 0) {
        saveState(state);
        console.log(
          `  ${done}/${pending.length}  (${(bytes / 1024 / 1024).toFixed(1)} MB, ${failed} failed)`,
        );
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
  );
  saveState(state);

  const okCount = all.filter((u) => state[u]?.status === "ok").length;
  const gone = all.filter((u) => state[u]?.status === "gone").length;
  const stillFailing = all.length - okCount - gone;

  console.log(`
  downloaded   ${okCount}/${all.length}
  volume       ${(bytes / 1024 / 1024).toFixed(1)} MB this run
  gone         ${gone}  (404/403 on the old server, unrecoverable)
  failed       ${stillFailing}  (retryable)
  storage      ${STORAGE}`);

  // Only a retryable failure is worth a non-zero exit. Files the old server
  // has already deleted are a fact to report, not an error to act on.
  if (stillFailing > 0) {
    console.log(`
  Some files did not transfer. Re-run this script to retry only those.
  Failures are listed in migration/media-state.json.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
