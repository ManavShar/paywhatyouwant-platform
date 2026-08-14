/**
 * Triage rules for imported WordPress content.
 *
 * The export mixes six years of genuine work by real creators with leftover
 * developer test records and a little spam. Deleting on a guess would lose
 * real work, so almost everything here only *withholds* an item from the
 * public site — it stays in the database and appears in the review report.
 *
 * Exactly one rule deletes outright, and it is about illegality rather than
 * quality. Everything else is reversible by flipping a status field.
 */

import type { WpProduct, WpUser } from "./wp-parse";

export type Verdict =
  | { action: "import"; reason?: undefined }
  | { action: "flag"; reason: string }
  | { action: "drop"; reason: string };

/**
 * Content that must not be republished regardless of who uploaded it.
 * "Carding" is credit-card fraud instruction. Hosting it would expose the
 * platform legally and is not a judgement call worth deferring.
 */
const ILLEGAL_CONTENT_PATTERNS = [/\bcarding\b/i];

/** Developer and QA accounts, matched whole rather than by substring. */
const TEST_ACCOUNT_PATTERNS = [
  /^(max)?test\d*$/i,
  /^m?t\d+$/i,
  /^[a-z]\d+$/i, // g2, a4, m5
  /^dev\d*$/i,
  /^phpdev\d*$/i,
  /^nov\d+$/i,
  /^test[\s_-]?\d*$/i,
  /^concepttest$/i,
  /^demoboom$/i,
  /^.*test\s*account$/i,
  /^fixsupport$/i,
];

/**
 * Titles that carry no meaning: keyboard mashing, or bare placeholders.
 * Deliberately narrow — a short real title like "Fog" must survive.
 */
function isPlaceholderTitle(title: string): boolean {
  const t = title.trim();
  if (t.length === 0) return true;
  if (/^(test|testing|asdf|qwerty|untitled|new product|final ?test|tag\d+)\d*$/i.test(t)) {
    return true;
  }
  // Keyboard mash: a long run of letters with no vowels, e.g. "fgdfgdfgdg".
  if (t.length >= 6 && /^[a-z]+$/i.test(t) && !/[aeiou]/i.test(t)) return true;
  // A single character repeated, e.g. "aaaa".
  if (t.length >= 4 && /^(.)\1+$/i.test(t)) return true;
  return false;
}

export function isTestAccount(login: string): boolean {
  return TEST_ACCOUNT_PATTERNS.some((re) => re.test(login.trim()));
}

export function triageUser(user: WpUser): Verdict {
  if (isTestAccount(user.login)) {
    return { action: "flag", reason: `Account name matches a test pattern` };
  }
  return { action: "import" };
}

export function triageProduct(
  product: WpProduct,
  vendorLogin: string,
): Verdict {
  const haystack = `${product.title} ${product.tags.join(" ")}`;

  if (ILLEGAL_CONTENT_PATTERNS.some((re) => re.test(haystack))) {
    return {
      action: "drop",
      reason: "Credit-card fraud material — not republishable",
    };
  }

  if (isPlaceholderTitle(product.title)) {
    return { action: "flag", reason: `Placeholder title ("${product.title}")` };
  }

  if (isTestAccount(vendorLogin)) {
    return { action: "flag", reason: `Uploaded by test account "${vendorLogin}"` };
  }

  // WordPress already considered these not-public; respect that.
  if (product.status === "trash") {
    return { action: "flag", reason: "In the trash on the old site" };
  }
  if (product.status === "draft") {
    return { action: "flag", reason: "Still a draft on the old site" };
  }
  if (product.status === "private") {
    return { action: "flag", reason: "Marked private on the old site" };
  }

  // A product with nothing attached at all is useless to a buyer. But a
  // product with only a PREVIEW is not broken — it is a streaming item, which
  // is exactly what the podcast catalogue is and exactly what the brief asks
  // for ("we will also require streaming so people can listen to podcasts etc
  // and choose what they pay"). Only flag when there is neither.
  if (product.files.length === 0 && product.previewAttachmentIds.length === 0) {
    return { action: "flag", reason: "Nothing attached — no file and no preview" };
  }

  return { action: "import" };
}
