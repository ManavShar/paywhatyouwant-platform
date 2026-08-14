import Image from "next/image";
import Link from "next/link";
import { ImageOff, Music, Mic, BookOpen } from "lucide-react";
import { Category } from "@prisma/client";
import { cn, formatPrice } from "@/lib/utils";
import { AUDIO_CATEGORIES } from "@/lib/taxonomy";

export type ProductCardData = {
  slug: string;
  title: string;
  coverImageUrl: string | null;
  suggestedPriceCents: number;
  category: Category;
  vendor: { username: string; name: string | null };
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
 * Hover reveals the creator on pointer devices; on touch it is always visible,
 * since there is no hover to discover it with.
 */
export function ProductCard({
  product,
  variant = "uniform",
  priority = false,
}: {
  product: ProductCardData;
  variant?: "masonry" | "uniform";
  priority?: boolean;
}) {
  const href = `/product/${product.slug}`;
  const creator = product.vendor.name || product.vendor.username;

  if (variant === "masonry") {
    return (
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-card bg-surface"
      >
        {product.coverImageUrl ? (
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
        )}

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
            {creator} · {priceLabel(product.suggestedPriceCents)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface">
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
        <p className="mt-0.5 truncate text-sm text-ink-muted">{creator}</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {priceLabel(product.suggestedPriceCents)}
        </p>
      </div>
    </Link>
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
