import { Category, Licence } from "@prisma/client";

/* Display metadata for the five categories carried over from the existing
   site. `layout` drives the grid: photography and digital art are shown in
   true masonry with uncropped images, while music, podcasts and ebooks use
   uniform cards because their artwork is square-ish and the metadata matters
   more than the image. */

export type CategoryMeta = {
  value: Category;
  label: string;
  slug: string;
  layout: "masonry" | "uniform";
  /** Used in empty states and category page intros. */
  blurb: string;
};

export const CATEGORIES: CategoryMeta[] = [
  {
    value: Category.PHOTOGRAPHY,
    label: "Photography",
    slug: "photography",
    layout: "masonry",
    blurb: "Photographs from creators around the world. Pay what you think they're worth.",
  },
  {
    value: Category.MUSIC,
    label: "Music",
    slug: "music",
    layout: "uniform",
    blurb: "Tracks and albums, straight from the artists who made them.",
  },
  {
    value: Category.DIGITAL_ART,
    label: "Digital Art",
    slug: "digital-art",
    layout: "masonry",
    blurb: "Illustration, generative work and digital painting.",
  },
  {
    value: Category.EBOOKS,
    label: "Ebooks",
    slug: "ebooks",
    layout: "uniform",
    blurb: "Books and long-form writing, priced by the reader.",
  },
  {
    value: Category.PODCASTS,
    label: "Podcasts",
    slug: "podcasts",
    layout: "uniform",
    blurb: "Listen first, then decide what the episode was worth to you.",
  },
];

/**
 * Whether the site states how many items it holds.
 *
 * Off, at Max's request: "we probably shouldn't list the number of items in
 * photography, music, ebooks etc as it doesn't look impressive — let's wait
 * till it's 50 million items." A catalogue of 138 advertising itself as 138
 * makes the place look empty; saying nothing makes it look unbothered.
 *
 * One flag rather than five deletions, so turning them back on when the number
 * is worth showing is a one-line change.
 */
// Typed as boolean, not the literal `false`, so both branches at every call
// site stay type-checked and flipping it needs no other edit.
export const SHOW_CATALOGUE_COUNTS: boolean = false;

export const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));
export const CATEGORY_BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

/** Categories whose products are primarily audio, and so get a player. */
export const AUDIO_CATEGORIES = new Set<Category>([
  Category.MUSIC,
  Category.PODCASTS,
]);

/* ---------------------------------------------------------------- licences --

   Creators care about licensing, and stating it plainly is a genuine
   differentiator against stock libraries that bury it. Shown on the product
   page and inside the embed.
--------------------------------------------------------------------------- */

export const LICENCES: Record<
  Licence,
  { label: string; short: string; description: string }
> = {
  [Licence.CREATIVE_COMMONS]: {
    label: "Creative Commons",
    short: "CC",
    description:
      "Free to share and adapt, including commercially, as long as you credit the creator.",
  },
  [Licence.CREATIVE_COMMONS_NO_DERIVS]: {
    label: "Creative Commons — No Derivatives",
    short: "CC-ND",
    description:
      "Free to share with credit, but you may not distribute modified versions.",
  },
  [Licence.ALL_RIGHTS_RESERVED]: {
    label: "All Rights Reserved",
    short: "©",
    description:
      "For personal use. Contact the creator for any commercial or redistribution rights.",
  },
  [Licence.PUBLIC_DOMAIN]: {
    label: "Public Domain",
    short: "PD",
    description: "No rights reserved. Use it however you like, no credit required.",
  },
};
