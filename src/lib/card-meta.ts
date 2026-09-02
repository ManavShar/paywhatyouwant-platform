/**
 * How much a catalogue card says about itself.
 *
 *  - `hover`   the image is left clean and the title, category and price are
 *              revealed by an overlay on hover (and shown permanently on
 *              touch, where there is no hover to discover them with).
 *  - `always`  the same information sits under every image, permanently.
 *
 * Max compared both and chose hover: "it looks better with the titles only
 * showing when you hover, but there may be a way to make them look good
 * continuously on there. I'll think about it." So hover is the default and
 * `always` stays behind `?cards=always` — pared back to a quiet title, with
 * the category and price still deferred to hover, which is the version that
 * survives a wall of photographs without turning into a spreadsheet.
 *
 * Constants and types only — the resolver lives in `card-meta.server.ts`,
 * because cards are drawn by client components and reading a cookie is not
 * something a client component may import.
 */
export type CardMeta = "always" | "hover";

export const CARD_META_COOKIE = "cards";
export const DEFAULT_CARD_META: CardMeta = "hover";

export function parseCardMeta(value: string | undefined): CardMeta | null {
  return value === "always" || value === "hover" ? value : null;
}
