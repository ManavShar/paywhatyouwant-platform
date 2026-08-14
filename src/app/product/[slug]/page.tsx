import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, FileText, Shield } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { ProductGrid } from "@/components/product/ProductGrid";
import { AudioPlayer } from "@/components/media/AudioPlayer";
import { EmbedCode } from "@/components/product/EmbedCode";
import { getProductBySlug, getRelatedProducts } from "@/lib/queries";
import { LICENCES, CATEGORY_BY_VALUE, AUDIO_CATEGORIES } from "@/lib/taxonomy";
import { formatBytes, formatCount } from "@/lib/utils";

export async function generateMetadata(
  props: PageProps<"/product/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };

  return {
    title: product.title,
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 160),
      images: product.coverImageUrl ? [product.coverImageUrl] : undefined,
    },
  };
}

export default async function ProductPage(props: PageProps<"/product/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.slug, product.category, 10);

  const creatorName = product.vendor.name || product.vendor.username;
  const licence = LICENCES[product.licence];
  const categoryMeta = CATEGORY_BY_VALUE.get(product.category);

  const paidFile = product.files.find((f) => !f.isPreview);
  const previewFile = product.files.find((f) => f.isPreview);
  const isAudio = AUDIO_CATEGORIES.has(product.category);

  // Preview assets are copied into the public tree at import; paid files never
  // are, so a preview URL is safe to render directly.
  const previewSrc = previewFile ? `/media/${previewFile.storageKey}` : null;

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
          {/* ---- the work itself ------------------------------------- */}
          <div className="min-w-0">
            {product.coverImageUrl ? (
              <div className="overflow-hidden rounded-card bg-surface">
                <Image
                  src={product.coverImageUrl}
                  alt={product.title}
                  width={1200}
                  height={800}
                  priority
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : (
              <div className="grid aspect-[3/2] place-items-center rounded-card bg-surface text-ink-subtle">
                <FileText className="h-10 w-10" aria-hidden />
              </div>
            )}

            {isAudio && previewSrc && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-ink">
                  Listen before you decide
                </p>
                <AudioPlayer src={previewSrc} title={product.title} />
              </div>
            )}

            <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {product.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <Link
                href={`/vendor/${product.vendor.username}`}
                className="font-semibold text-ink hover:underline"
              >
                {creatorName}
              </Link>
              {product.salesCount > 0 && (
                <span>{formatCount(product.salesCount)} downloads</span>
              )}
              {product.viewCount > 0 && (
                <span>{formatCount(product.viewCount)} views</span>
              )}
            </div>

            {product.description && (
              <div className="mt-6 max-w-2xl whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-muted">
                {product.description}
              </div>
            )}

            {product.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {product.tags.map(({ tag }) => (
                  <Link
                    key={tag.id}
                    href={`/browse?q=${encodeURIComponent(tag.name)}`}
                    className="rounded-full border border-hairline-strong px-3 py-1 text-xs font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ---- the decision ---------------------------------------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <PurchasePanel
              productSlug={product.slug}
              suggestedPriceCents={product.suggestedPriceCents}
              minimumPriceCents={product.minimumPriceCents}
              creatorName={creatorName}
            />

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

              {paidFile && (
                <div className="flex items-start gap-3">
                  <Download
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle"
                  />
                  <div>
                    <dt className="font-semibold text-ink">
                      {paidFile.extension
                        ? `.${paidFile.extension} file`
                        : "Digital download"}
                    </dt>
                    <dd className="mt-0.5 text-ink-muted">
                      {paidFile.sizeBytes
                        ? formatBytes(paidFile.sizeBytes)
                        : "Instant download"}
                    </dd>
                  </div>
                </div>
              )}
            </dl>

            <EmbedCode productSlug={product.slug} />
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="mb-5 text-xl font-bold tracking-tight">
              More {categoryMeta?.label.toLowerCase() ?? "like this"}
            </h2>
            <ProductGrid products={related} priorityCount={0} />
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
