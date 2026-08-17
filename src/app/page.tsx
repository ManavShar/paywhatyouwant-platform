import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SearchBar } from "@/components/layout/SearchBar";
import { ProductGrid } from "@/components/product/ProductGrid";
import { VideoIntro } from "@/components/home/VideoIntro";
import { CATEGORIES } from "@/lib/taxonomy";
import {
  getFeaturedProducts,
  getCategoryCounts,
  getCategoryCovers,
} from "@/lib/queries";

/**
 * Buyer-led homepage.
 *
 * Max's own description of the experience he wanted: "shopping around for
 * images, but choosing to pay the creator a couple of dollars for it." So the
 * page behaves like a stock library — search, then a wall of work — and the
 * pay-what-you-want mechanic reveals itself at the moment of purchase rather
 * than being explained up front.
 *
 * Deliberately no carousel. It is the pattern this kind of site reaches for
 * and it consistently underperforms a plain browsable grid.
 */
/**
 * Without this the homepage prerenders once at build time and the catalogue
 * it shows is frozen forever — new uploads would never surface. Five minutes
 * keeps it fast to serve while staying current enough for a marketplace.
 */
export const revalidate = 300;

export default async function HomePage() {
  const [featured, counts, covers] = await Promise.all([
    getFeaturedProducts(30),
    getCategoryCounts(),
    getCategoryCovers(),
  ]);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      {/* The hero has its own search, so the header's is redundant here. */}
      <SiteHeader showSearch={false} />

      <main>
        <section className="mx-auto max-w-[1600px] px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Great work.{" "}
              <span className="text-brand-gradient">You decide the price.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Photography, music, podcasts, digital art and ebooks from
              independent creators. Every single item is pay what you want.
            </p>

            <Suspense fallback={<div className="mt-8 h-14" />}>
              <SearchBar
                size="lg"
                className="mx-auto mt-8 max-w-2xl"
                placeholder="Try “landscape”, “piano”, “Wales”…"
              />
            </Suspense>

            {total > 0 && (
              <p className="mt-4 text-sm text-ink-subtle">
                {total.toLocaleString()} items from independent creators
              </p>
            )}
          </div>
        </section>

        {/* Categories, as image tiles rather than text links — this is a
            visual catalogue and the tiles double as a preview of the work. */}
        <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((c) => {
              const cover = covers.get(c.value);
              return (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  className="group relative aspect-[3/2] overflow-hidden rounded-card bg-surface"
                >
                  {cover && (
                    <Image
                      src={cover}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, 20vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3">
                    <span className="block text-sm font-bold text-white sm:text-base">
                      {c.label}
                    </span>
                    <span className="block text-xs text-white/75">
                      {counts.get(c.value) ?? 0} items
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* The wall. This is the page. */}
        <section className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              Discover
            </h2>
            <Link
              href="/browse"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Browse everything
            </Link>
          </div>

          {featured.length > 0 ? (
            <ProductGrid products={featured} variant="masonry" priorityCount={6} />
          ) : (
            <EmptyCatalogue />
          )}
        </section>

        {/* Max's explainer from the old site. Placed below the wall for the
            same reason as the creator pitch: someone who arrived to look at
            work should be looking at work, and the explanation is there for
            the people who scroll wanting one. */}
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
                What is Paywhatyouwant
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-ink-muted">
                A minute on how it works, from our founder.
              </p>
              <div className="mt-8">
                <VideoIntro />
              </div>
            </div>
          </div>
        </section>

        {/* The creator pitch lives here, below the browse experience, rather
            than competing with it at the top of the page. */}
        <section className="border-t border-hairline bg-surface">
          <div className="mx-auto max-w-[1600px] px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                Made something? Put it up.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-muted">
                Set a suggested price and let people decide what your work is
                worth to them. Keep the rights you choose, embed your work
                anywhere, and get paid directly.
              </p>
              <Link
                href="/sell"
                className="mt-6 inline-flex h-12 items-center rounded-control bg-brand px-6 font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
              >
                Start selling
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function EmptyCatalogue() {
  return (
    <div className="rounded-card border border-dashed border-hairline-strong py-20 text-center">
      <p className="font-semibold text-ink">Nothing here yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        The catalogue is empty. Run{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
          npm run migrate:import
        </code>{" "}
        to bring across the products from the old site.
      </p>
    </div>
  );
}
