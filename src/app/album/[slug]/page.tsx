import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, FileText, Shield, Layers } from "lucide-react";
import { ProductStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { getAlbumBySlug } from "@/lib/queries";
import { LICENCES, CATEGORY_BY_VALUE, AUDIO_CATEGORIES } from "@/lib/taxonomy";
import { formatPrice, formatMoney, formatBytes, formatCount } from "@/lib/utils";

export async function generateMetadata(
  props: PageProps<"/album/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const album = await getAlbumBySlug(slug);
  if (!album) return { title: "Not found" };

  return {
    title: album.title,
    description: album.description.slice(0, 160),
    openGraph: {
      title: album.title,
      description: album.description.slice(0, 160),
      images: album.coverImageUrl ? [album.coverImageUrl] : undefined,
    },
  };
}

export default async function AlbumPage(props: PageProps<"/album/[slug]">) {
  const { slug } = await props.params;
  const album = await getAlbumBySlug(slug);
  if (!album) notFound();

  const creatorName = album.vendor.name || album.vendor.username;
  const licence = LICENCES[album.licence];
  const categoryMeta = CATEGORY_BY_VALUE.get(album.category);
  const isAudio = AUDIO_CATEGORIES.has(album.category);

  // Only members that are actually live and actually have something to hand
  // over — the same filter checkout applies, so the page cannot advertise more
  // than the purchase delivers.
  const members = album.items
    .map((item) => item.product)
    .filter((p) => p.status === ProductStatus.PUBLISHED);

  const deliverable = members.filter((p) =>
    p.files.some((f) => !f.isPreview),
  );

  // The best-value claim, stated as arithmetic rather than asserted. If the
  // parts do not actually cost more, nothing is claimed.
  const partsTotal = members.reduce((sum, p) => sum + p.suggestedPriceCents, 0);
  const saving = partsTotal - album.suggestedPriceCents;
  const worthSaying = saving > 0 && album.suggestedPriceCents > 0;

  const noun = itemNoun(album.category, members.length);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-ink-muted">
          <Link href="/browse" className="hover:text-ink">
            Browse
          </Link>
          {categoryMeta && (
            <>
              <span aria-hidden className="px-2">
                /
              </span>
              <Link
                href={`/category/${categoryMeta.slug}`}
                className="hover:text-ink"
              >
                {categoryMeta.label}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          <div className="min-w-0">
            {album.coverImageUrl ? (
              <div className="overflow-hidden rounded-card bg-surface">
                <Image
                  src={album.coverImageUrl}
                  alt={album.title}
                  width={1200}
                  height={800}
                  priority
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : (
              <div className="grid aspect-[3/2] place-items-center rounded-card bg-surface text-ink-subtle">
                <Layers className="h-10 w-10" aria-hidden />
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                <Layers className="h-3.5 w-3.5" aria-hidden />
                {members.length} {noun}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {album.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <Link
                href={`/vendor/${album.vendor.username}`}
                className="font-semibold text-ink hover:underline"
              >
                {creatorName}
              </Link>
              {album.salesCount > 0 && (
                <span>{formatCount(album.salesCount)} downloads</span>
              )}
            </div>

            {album.description && (
              <div className="mt-6 max-w-2xl whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
                {album.description}
              </div>
            )}

            {/* ---- what's inside ------------------------------------- */}
            <section className="mt-10">
              <h2 className="mb-4 text-lg font-bold tracking-tight text-ink">
                What&apos;s inside
              </h2>

              <ol className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline">
                {members.map((product, index) => {
                  const preview = product.files.find((f) => f.isPreview);
                  const paid = product.files.find((f) => !f.isPreview);
                  return (
                    <li key={product.slug} className="bg-surface">
                      <div className="flex items-center gap-4 p-4">
                        <span className="w-6 shrink-0 text-sm tabular-nums text-ink-subtle">
                          {index + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/product/${product.slug}`}
                            className="block truncate text-[0.9375rem] font-semibold text-ink hover:underline"
                          >
                            {product.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {paid?.extension ? `.${paid.extension}` : "File"}
                            {paid?.sizeBytes
                              ? ` · ${formatBytes(paid.sizeBytes)}`
                              : ""}
                          </p>
                        </div>

                        {/* Every item is separately buyable — the second half
                            of what the client asked for. The price is a link
                            to its own page, where the full control lives. */}
                        <Link
                          href={`/product/${product.slug}`}
                          className="shrink-0 rounded-control border border-hairline-strong px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-hover"
                        >
                          {product.suggestedPriceCents === 0
                            ? "Name your price"
                            : `Just this — from ${formatPrice(product.suggestedPriceCents)}`}
                        </Link>
                      </div>

                      {isAudio && preview && (
                        <div className="px-4 pb-4 pl-14">
                          <AudioPlayer
                            src={`/media/${preview.storageKey}`}
                            title={product.title}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          {/* ---- the decision ---------------------------------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {deliverable.length > 0 ? (
              <>
                <div className="mb-3 rounded-card border border-brand/30 bg-brand/5 p-4">
                  <p className="text-sm font-bold text-ink">
                    The whole collection
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    One payment, all {members.length} {noun}.
                    {worthSaying && (
                      <>
                        {" "}
                        Bought separately they suggest{" "}
                        <span className="font-semibold text-ink">
                          {formatMoney(partsTotal)}
                        </span>
                        , so this is {formatMoney(saving)} less.
                      </>
                    )}
                  </p>
                </div>

                <PurchasePanel
                  albumSlug={album.slug}
                  suggestedPriceCents={album.suggestedPriceCents}
                  minimumPriceCents={album.minimumPriceCents}
                  creatorName={creatorName}
                />
              </>
            ) : (
              <div className="rounded-card border border-hairline bg-surface p-5">
                <p className="text-lg font-bold tracking-tight text-ink">
                  Nothing to download yet
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {creatorName} hasn&apos;t attached files to this collection
                  yet.
                </p>
              </div>
            )}

            <dl className="mt-5 space-y-3 rounded-card border border-hairline bg-surface p-5 text-sm">
              <div className="flex items-start gap-3">
                <Shield
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle"
                />
                <div>
                  <dt className="font-semibold text-ink">{licence.label}</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-muted">
                    {licence.description}
                  </dd>
                </div>
              </div>

              {deliverable.length > 0 && (
                <div className="flex items-start gap-3">
                  <Download
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle"
                  />
                  <div>
                    <dt className="font-semibold text-ink">
                      {deliverable.length} separate{" "}
                      {deliverable.length === 1 ? "download" : "downloads"}
                    </dt>
                    <dd className="mt-0.5 text-ink-muted">
                      {formatBytes(
                        deliverable.reduce(
                          (sum, p) =>
                            sum +
                            (p.files.find((f) => !f.isPreview)?.sizeBytes ?? 0),
                          0,
                        ),
                      )}{" "}
                      in total
                    </dd>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle"
                />
                <div>
                  <dt className="font-semibold text-ink">
                    Or take just the ones you want
                  </dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-muted">
                    Every {itemNoun(album.category, 1)} above is on sale on its
                    own, at whatever you think it&apos;s worth.
                  </dd>
                </div>
              </div>
            </dl>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

/** What the things inside a collection are called, by category. */
function itemNoun(
  category: Parameters<typeof CATEGORY_BY_VALUE.get>[0],
  count: number,
): string {
  const one = count === 1;
  const map: Record<string, [string, string]> = {
    MUSIC: ["track", "tracks"],
    PODCASTS: ["episode", "episodes"],
    PHOTOGRAPHY: ["photo", "photos"],
    EBOOKS: ["book", "books"],
  };
  const pair = map[category as string] ?? ["item", "items"];
  return one ? pair[0] : pair[1];
}
