import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { BrowseToolbar } from "@/components/product/BrowseToolbar";
import { browseProducts } from "@/lib/queries";
import { CATEGORY_BY_SLUG, CATEGORIES } from "@/lib/taxonomy";

/** Keep category listings current as new work is published. */
export const revalidate = 300;

/** Category pages are stable routes, so pre-render them all. */
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(
  props: PageProps<"/category/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const meta = CATEGORY_BY_SLUG.get(slug);
  if (!meta) return { title: "Not found" };
  return { title: meta.label, description: meta.blurb };
}

export default async function CategoryPage(
  props: PageProps<"/category/[slug]">,
) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const meta = CATEGORY_BY_SLUG.get(slug);
  if (!meta) notFound();

  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const sortRaw = first(sp.sort);
  const sort =
    sortRaw === "popular" || sortRaw === "price-low" ? sortRaw : "newest";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const { items, total } = await browseProducts({
    category: meta.value,
    freeOnly: first(sp.free) === "1",
    sort,
    page,
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {meta.label}
        </h1>
        <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          {meta.blurb}
        </p>

        <div className="mt-6">
          <Suspense fallback={<div className="h-14" />}>
            <BrowseToolbar total={total} showCategories={false} />
          </Suspense>
        </div>

        {items.length > 0 ? (
          <ProductGrid products={items} variant={meta.layout} priorityCount={8} />
        ) : (
          <p className="py-24 text-center text-ink-muted">
            Nothing in {meta.label.toLowerCase()} yet.
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
