/**
 * Reads the WordPress WXR export into a plain, inspectable manifest.
 *
 * Parsing is kept strictly separate from downloading and from database writes
 * so that each stage can be re-run independently: the manifest is a checkpoint
 * you can read, diff, and hand to someone for review.
 */

import { XMLParser } from "fast-xml-parser";
import { phpUnserialize, asArray, type PhpValue } from "./php-unserialize";

// ------------------------------------------------------------------ types --

export type WpAttachment = {
  id: number;
  url: string;
  title: string;
  mimeType?: string;
};

export type WpProductFile = {
  name: string;
  url: string;
};

export type WpProduct = {
  id: number;
  title: string;
  slug: string;
  description: string;
  status: string;
  authorLogin: string;
  /** EDD stores the true vendor here; it can differ from the post author. */
  commissionUserId?: number;
  date?: string;
  category?: string;
  tags: string[];
  licence?: string;
  suggestedPriceCents: number;
  minimumPriceCents: number;
  thumbnailId?: number;
  previewAttachmentIds: number[];
  files: WpProductFile[];
  fileTypes?: string;
  fileSize?: string;
  salesCount: number;
  earningsCents: number;
  hits: number;
  averageRating?: number;
};

export type WpUser = {
  id: number;
  login: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
};

export type WpManifest = {
  generatedAt: string;
  sourceFile: string;
  users: WpUser[];
  products: WpProduct[];
  attachments: WpAttachment[];
};

// ----------------------------------------------------------------- helpers --

type RawNode = Record<string, unknown>;

/**
 * WXR values arrive in several shapes depending on whether the tag used CDATA:
 * a bare string, a `{ "#text": ... }` wrapper, or — for CDATA content —
 * an *array* of such wrappers, e.g. `[{ "#text": "attachment" }]`.
 * Long descriptions can legitimately span several CDATA sections, so array
 * parts are joined rather than truncated to the first.
 */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "object" && "#text" in (value as RawNode)) {
    return text((value as RawNode)["#text"]);
  }
  return "";
}

/**
 * WordPress stores titles and term names HTML-encoded, and because they sit
 * inside CDATA the XML parser hands them back with the entities intact — so a
 * title arrives as "Gromit &amp; Wallace" and would render literally like
 * that. React escapes on output, so this must be decoded on the way IN.
 */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Ampersand last: decoding it first would let "&amp;lt;" become "<".
    .replace(/&amp;/g, "&");
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Builds a key→value map from the repeated <wp:postmeta> blocks. */
function metaMap(item: RawNode): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of toArray(item["wp:postmeta"] as RawNode | RawNode[])) {
    const key = text(m["wp:meta_key"]);
    if (key) out.set(key, text(m["wp:meta_value"]));
  }
  return out;
}

/**
 * Dollars → cents. Prices in the export are strings like "1.99" or "11.00",
 * and occasionally blank. Rounding via Math.round on the scaled value avoids
 * the classic 19.99 * 100 = 1998.9999 float error.
 */
export function dollarsToCents(value: string | undefined | null): number {
  if (!value) return 0;
  const n = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Pulls `<category domain="..." nicename="...">Label</category>` entries. */
function categoriesOf(item: RawNode, domain: string): string[] {
  return toArray(item.category as RawNode | RawNode[])
    .filter((c) => typeof c === "object" && c["@_domain"] === domain)
    .map((c) => decodeEntities(text(c)))
    .filter(Boolean);
}

// ------------------------------------------------------------------ parse --

export function parseWordpressExport(
  xml: string,
  sourceFile: string,
): WpManifest {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Keep everything as strings; we do our own coercion. Otherwise WordPress
    // slugs like "2020" or "134" silently become numbers.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    cdataPropName: "#text",
  });

  const doc = parser.parse(xml) as RawNode;
  const channel = (doc.rss as RawNode)?.channel as RawNode;
  if (!channel) throw new Error("Not a WordPress WXR export: no rss>channel");

  // ---- users
  const users: WpUser[] = toArray(
    channel["wp:author"] as RawNode | RawNode[],
  ).map((a) => ({
    id: Number.parseInt(text(a["wp:author_id"]), 10),
    login: text(a["wp:author_login"]),
    email: text(a["wp:author_email"]),
    displayName: decodeEntities(
      text(a["wp:author_display_name"]) || text(a["wp:author_login"]),
    ),
    firstName: text(a["wp:author_first_name"]) || undefined,
    lastName: text(a["wp:author_last_name"]) || undefined,
  }));

  const items = toArray(channel.item as RawNode | RawNode[]);
  const attachments: WpAttachment[] = [];
  const products: WpProduct[] = [];

  for (const item of items) {
    const postType = text(item["wp:post_type"]);
    const id = Number.parseInt(text(item["wp:post_id"]), 10);

    if (postType === "attachment") {
      const url = text(item["wp:attachment_url"]);
      if (url) {
        attachments.push({ id, url, title: decodeEntities(text(item.title)) });
      }
      continue;
    }

    if (postType !== "download") continue;

    const meta = metaMap(item);

    // EDD's "custom pricing" default is the suggested price shown to buyers.
    // Fall back to the plain edd_price when it's absent.
    const suggested =
      dollarsToCents(meta.get("edd_cp_default_price")) ||
      dollarsToCents(meta.get("edd_price"));

    // Product files, PHP-serialized as a list of {name, file, condition}.
    const files: WpProductFile[] = asArray(
      phpUnserialize(meta.get("edd_download_files") ?? null),
    )
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const rec = entry as Record<string, PhpValue>;
        const url = typeof rec.file === "string" ? rec.file : "";
        if (!url) return null;
        return {
          name:
            typeof rec.name === "string" && rec.name
              ? rec.name
              : decodeURIComponent(url.split("/").pop() ?? "download"),
          url,
        };
      })
      .filter((f): f is WpProductFile => f !== null);

    // Preview file meta is a list of attachment IDs.
    const previewAttachmentIds = asArray(
      phpUnserialize(meta.get("preview_file") ?? null),
    )
      .map((v) => (typeof v === "number" ? v : Number.parseInt(String(v), 10)))
      .filter((n) => Number.isFinite(n));

    // The commission settings carry the real vendor user id.
    const commission = phpUnserialize(meta.get("_edd_commission_settings") ?? null);
    let commissionUserId: number | undefined;
    if (commission && typeof commission === "object" && !Array.isArray(commission)) {
      const raw = (commission as Record<string, PhpValue>).user_id;
      const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
      if (Number.isFinite(n)) commissionUserId = n;
    }

    const thumbRaw = meta.get("_thumbnail_id");
    const thumbnailId = thumbRaw ? Number.parseInt(thumbRaw, 10) : undefined;

    const ratingRaw = meta.get("edd_reviews_average_rating");
    const rating = ratingRaw ? Number.parseFloat(ratingRaw) : undefined;

    products.push({
      id,
      title: decodeEntities(text(item.title)),
      slug: text(item["wp:post_name"]),
      description: text(item["content:encoded"]),
      status: text(item["wp:status"]),
      authorLogin: text(item["dc:creator"]),
      commissionUserId,
      date: text(item["wp:post_date"]) || undefined,
      category: categoriesOf(item, "download_category")[0],
      tags: categoriesOf(item, "download_tag"),
      licence: meta.get("licence") || undefined,
      suggestedPriceCents: suggested,
      minimumPriceCents: dollarsToCents(meta.get("edd_cp_min")),
      thumbnailId: Number.isFinite(thumbnailId) ? thumbnailId : undefined,
      previewAttachmentIds,
      files,
      fileTypes: meta.get("file_types") || undefined,
      fileSize: meta.get("file_size") || undefined,
      salesCount: Number.parseInt(meta.get("_edd_download_sales") ?? "0", 10) || 0,
      earningsCents: dollarsToCents(meta.get("_edd_download_earnings")),
      hits: Number.parseInt(meta.get("hits") ?? "0", 10) || 0,
      averageRating: Number.isFinite(rating) ? rating : undefined,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceFile,
    users,
    products,
    attachments,
  };
}
