import Image from "next/image";
import Link from "next/link";
import { ImageOff, Music, Mic, BookOpen } from "lucide-react";
import { Category } from "@prisma/client";
import { cn, formatPrice } from "@/lib/utils";
import { AUDIO_CATEGORIES, CATEGORY_BY_VALUE } from "@/lib/taxonomy";
import { DEFAULT_CARD_META, type CardMeta } from "@/lib/card-meta";

export type ProductCardData = {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  suggestedPriceCents: number;
  category: Category;
  vendor: { username: string; name: string | null };
  /**
   * Which of the two things this is. Absent means a product — most callers
   * predate albums and every one of them means a product.
   */
  kind?: "product" | "album";
  /** Albums only: how many items are inside, for the count badge. */
  itemCount?: number;
};

/**
 * One catalogue item.
 *
 * Two shapes, chosen by category:
 *  - `masonry`  photography and digital art. The image is never cropped;
 *               its natural aspect ratio drives the column flow.
 *  - `uniform`  music, podcasts, ebooks. Square artwork, metadata below.
 *
 * The suggested price is shown as "from $X" rather than a hard price, because
 * on this site it is a starting point for a conversation, not a demand.
 *
 * `meta` decides whether the masonry card states what it is permanently or
 * only on hover — the comparison Max asked for. See `src/lib/card-meta.ts`.
 * The uniform card has always captioned itself, and does either way; all that
 * changes there is that the category is now named rather than implied by which
 * page you happen to be on.
 */
export function ProductCard({
  product,
  variant = "uniform",
  priority = false,
  meta = DEFAULT_CARD_META,
}: {
  product: ProductCardData;
  variant?: "masonry" | "uniform";
  priority?: boolean;
  meta?: CardMeta;
}) {
  const isAlbum = product.kind === "album";
  const href = isAlbum ? `/album/${product.slug}` : `/product/${product.slug}`;
  const creator = product.vendor.name || product.vendor.username;
  const categoryLabel = CATEGORY_BY_VALUE.get(product.category)?.label;
  // An album competes for attention with single items on the same wall, so it
  // has to say what it is at a glance. The count is the useful part — "10
  // tracks" tells you more than the word "album" does.
  const countLabel = isAlbum
    ? `${product.itemCount ?? 0} ${itemNoun(product.category, product.itemCount ?? 0)}`
    : null;

  if (variant === "masonry") {
    const image = product.coverImageUrl ? (
      <Image
        src={product.coverImageUrl}
        alt={product.title}
        width={600}
        height={0}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        priority={priority}
        className="h-auto w-full object-cover transition-opacity duration-200 group-hover:opacity-95"
      />
    ) : (
      <PlaceholderArt category={product.category} className="aspect-[4/3]" />
    );

    if (meta === "always") {
      return (
        <Link href={href} className="group block">
          <div className="relative overflow-hidden rounded-card bg-surface">
            {image}
            {countLabel && <CountBadge label={countLabel} />}
          </div>

          {/* The "continuous" version, pared back. A wall of photographs with
              three lines of metadata under each one stops being a gallery and
              starts being a spreadsheet, so only the title is permanent; the
              rest fades in on hover. The second line stays in the layout at
              zero opacity rather than being conditionally rendered, so nothing
              reflows when the cursor arrives. */}
          <div className="mt-2.5">
            <p className="truncate text-sm font-medium leading-snug text-ink">
              {product.title}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-xs text-ink-muted",
                "opacity-100 transition-opacity duration-200",
                "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
              )}
            >
              {categoryLabel ? `${categoryLabel} · ` : ""}
              {creator} · {priceLabel(product.suggestedPriceCents)}
            </p>
          </div>
        </Link>
      );
    }

    return (
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-card bg-surface"
      >
        {image}
        {countLabel && <CountBadge label={countLabel} />}

        {/* Overlay: hidden until hover on pointer devices, always shown where
            there is no hover. */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-3 pt-10",
            "opacity-100 transition-opacity duration-200",
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
          )}
        >
          <p className="truncate text-sm font-semibold text-white">
            {product.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/80">
            {categoryLabel ? `${categoryLabel} · ` : ""}
            {creator} · {priceLabel(product.suggestedPriceCents)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface">
        {countLabel && <CountBadge label={countLabel} />}
        {product.coverImageUrl ? (
          <Image
            src={product.coverImageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <PlaceholderArt category={product.category} className="h-full" />
        )}
      </div>

      <div className="mt-2.5">
        <p className="truncate text-[0.9375rem] font-semibold leading-snug text-ink">
          {product.title}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
          {categoryLabel && <CategoryPill label={categoryLabel} />}
          <span className="truncate">{creator}</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {priceLabel(product.suggestedPriceCents)}
        </p>
      </div>
    </Link>
  );
}

/**
 * The "10 tracks" marker on an album card.
 *
 * Top-left and always visible, including in the hover variant: whether a card
 * is one photograph or a set of twenty is the thing a buyer most needs to know
 * before clicking, and hiding it until hover would mean phones never show it.
 */
function CountBadge({ label }: { label: string }) {
  return (
    <span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
      {label}
    </span>
  );
}

/** What the things inside a collection are called, by category. */
function itemNoun(category: Category, count: number): string {
  const one = count === 1;
  if (category === Category.MUSIC) return one ? "track" : "tracks";
  if (category === Category.PODCASTS) return one ? "episode" : "episodes";
  if (category === Category.PHOTOGRAPHY) return one ? "photo" : "photos";
  if (category === Category.EBOOKS) return one ? "book" : "books";
  return one ? "item" : "items";
}

/** Small enough to read as a tag rather than compete with the title. */
function CategoryPill({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-muted">
      {label}
    </span>
  );
}

/** "Free" reads oddly as a suggestion, so a zero suggestion is framed as choice. */
function priceLabel(cents: number): string {
  if (cents === 0) return "Name your price";
  return `from ${formatPrice(cents)}`;
}

function PlaceholderArt({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const Icon = AUDIO_CATEGORIES.has(category)
    ? category === Category.PODCASTS
      ? Mic
      : Music
    : category === Category.EBOOKS
      ? BookOpen
      : ImageOff;

  return (
    <div
      className={cn(
        "grid w-full place-items-center bg-surface text-ink-subtle",
        className,
      )}
    >
      <Icon className="h-8 w-8" aria-hidden />
    </div>
  );
}
