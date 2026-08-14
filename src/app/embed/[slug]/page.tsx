import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { LogoMark } from "@/components/ui/Logo";
import { getProductBySlug } from "@/lib/queries";
import { AUDIO_CATEGORIES } from "@/lib/taxonomy";
import { formatPrice } from "@/lib/utils";

/**
 * The embeddable widget — the reason this platform had to leave WordPress.
 *
 * Constraints that shaped it:
 *
 *  - It renders inside someone else's page, so it carries no site chrome and
 *    must stay legible down to about 300px wide.
 *  - The logo is always present. It is the branding that travels, and the
 *    thing a reader clicks to pay.
 *  - Paying opens the real flow in a NEW TAB. Never run a payment form inside
 *    a third-party iframe: the visitor cannot see the address bar, so they
 *    have no way to verify who they are paying. Breaking out is both safer
 *    and more honest.
 *  - Frame permission is granted to this route only, in next.config.ts.
 */

export const metadata: Metadata = {
  // Embeds must never be indexed as standalone pages; the product page is the
  // canonical destination.
  robots: { index: false, follow: false },
};

export default async function EmbedPage(props: PageProps<"/embed/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const creatorName = product.vendor.name || product.vendor.username;
  const previewFile = product.files.find((f) => f.isPreview);
  const previewSrc = previewFile ? `/media/${previewFile.storageKey}` : null;
  const isAudio = AUDIO_CATEGORIES.has(product.category);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const productUrl = `${siteUrl}/product/${product.slug}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden rounded-[12px] border border-hairline bg-canvas">
      <div className="flex min-h-0 flex-1 items-center gap-3 p-3">
        {product.coverImageUrl && (
          <div className="relative hidden h-full min-h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-surface min-[360px]:block">
            <Image
              src={product.coverImageUrl}
              alt=""
              fill
              sizes="72px"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div className="min-w-0">
            <a
              href={productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-bold leading-tight text-ink hover:underline"
            >
              {product.title}
            </a>
            <a
              href={`${siteUrl}/vendor/${product.vendor.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-ink-muted hover:underline"
            >
              {creatorName}
            </a>
          </div>

          {isAudio && previewSrc && (
            <AudioPlayer src={previewSrc} compact className="border-0 bg-surface" />
          )}
        </div>

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-10 shrink-0 place-items-center rounded-control bg-brand px-4 text-sm font-bold text-ink-inverse transition-colors hover:bg-brand-hover"
        >
          {product.suggestedPriceCents > 0
            ? `Pay from ${formatPrice(product.suggestedPriceCents)}`
            : "Pay what you want"}
        </a>
      </div>

      {/* The branding bar. Always present, always clickable. */}
      <a
        href={siteUrl || "/"}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1.5 border-t border-hairline bg-surface px-3 py-1.5 transition-colors hover:bg-surface-hover"
      >
        <LogoMark className="h-3.5 w-3.5" />
        <span className="text-[0.625rem] font-bold tracking-tight text-ink-muted">
          Paywhatyouwant.io
        </span>
        <span className="ml-auto text-[0.625rem] text-ink-subtle">
          You choose the price
        </span>
      </a>
    </div>
  );
}
