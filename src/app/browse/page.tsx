import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrowseToolbar } from "@/components/product/BrowseToolbar";
import { browseProducts } from "@/lib/queries";
import { CATEGORY_BY_SLUG } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Browse",
  description:
    "Browse pay-what-you-want photography, music, podcasts, digital art and ebooks.",
};

export default async function BrowsePage(props: PageProps<"/browse">) {
  // Next 16: searchParams is a Promise.
  const sp = await props.searchParams;

  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const q = first(sp.q)?.trim() || undefined;
  const categorySlug = first(sp.category);
  const category = categorySlug
    ? CATEGORY_BY_SLUG.get(categorySlug)?.value
    : undefined;
  const freeOnly = first(sp.free) === "1";
  const sortRaw = first(sp.sort);
  const sort =
    sortRaw === "popular" || sortRaw === "price-low" ? sortRaw : "newest";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const { items, total, pageCount } = await browseProducts({
    q,
    category,
    freeOnly,
    sort,
    page,
  });

  // Photography and digital art look best uncropped; everything else is
  // uniform. A mixed result set defaults to uniform so rows stay legible.
  const variant =
    category && CATEGORY_BY_SLUG.get(categorySlug!)?.layout === "masonry"
      ? "masonry"
      : "uniform";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {q ? (
            <>
              Results for{" "}
              <span className="text-brand-gradient">&ldquo;{q}&rdquo;</span>
            </>
          ) : (
            "Browse everything"
          )}
        </h1>

        <Suspense fallback={<div className="h-14" />}>
          <BrowseToolbar total={total} />
        </Suspense>

        {items.length > 0 ? (
          <>
            <ProductGrid products={items} variant={variant} priorityCount={8} />
            <Pagination page={page} pageCount={pageCount} params={sp} />
          </>
        ) : (
          <NoResults q={q} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function NoResults({ q }: { q?: string }) {
  return (
    <div className="py-24 text-center">
      <p className="text-lg font-semibold text-ink">Nothing matched</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        {q
          ? `We couldn't find anything for “${q}”. Try a broader word, or browse a category.`
          : "There's nothing here yet."}
      </p>
      <Link
        href="/browse"
        className="mt-6 inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold hover:bg-surface-hover"
      >
        Clear filters
      </Link>
    </div>
  );
}

/**
 * Real pagination rather than infinite scroll. Infinite scroll makes the
 * footer unreachable and gives search engines nothing to crawl; a "Load more"
 * enhancement can sit on top of this later without removing the links.
 */
function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined) continue;
      next.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (p > 1) next.set("page", String(p));
    const qs = next.toString();
    return qs ? `/browse?${qs}` : "/browse";
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex items-center justify-center gap-3"
    >
      {page > 1 && (
        <Link
          href={href(page - 1)}
          className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          Previous
        </Link>
      )}
      <span className="text-sm text-ink-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount && (
        <Link
          href={href(page + 1)}
          className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
