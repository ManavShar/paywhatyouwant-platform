import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { HeaderNav } from "@/components/layout/HeaderNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SearchBar } from "@/components/layout/SearchBar";
import { CATEGORIES } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The 404, which until now was Next's unstyled default.
 *
 * Renders `HeaderNav` directly with no user rather than going through
 * `SiteHeader`. Two reasons: Next prerenders the root not-found page at build
 * time, and `SiteHeader` reads the session, which cannot be done then — and
 * more usefully, an error page should not depend on authentication working.
 * The visitor sees the signed-out header, which is the right default for a
 * page nobody was supposed to reach.
 *
 * The Suspense boundaries are not decoration either: the header and the search
 * box both read the query string, and a component that does that on a page
 * Next renders at build time has to declare what to show while it waits. The
 * fallbacks reserve the same height so nothing jumps when they arrive.
 *
 * A missing page on a marketplace is usually one of two things: a piece of
 * work the creator has taken down, or a mistyped address. Neither is helped by
 * the word "404", so this offers the two ways out that actually work — search,
 * and the categories — rather than an apology.
 */
export default function NotFound() {
  return (
    <>
      <Suspense fallback={<div className="h-16 border-b border-hairline" />}>
        <HeaderNav user={null} />
      </Suspense>

      <main className="mx-auto max-w-lg px-4 py-20 text-center sm:py-28">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          We can&apos;t find that page
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          The address may be wrong, or the creator may have taken this piece
          down. Both happen.
        </p>

        <div className="mt-8">
          <Suspense fallback={<div className="h-12 rounded-control bg-surface" />}>
            <SearchBar placeholder="Search for something else…" />
          </Suspense>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              href={`/category/${category.slug}`}
              className="rounded-full border border-hairline-strong px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-hover"
            >
              {category.label}
            </Link>
          ))}
        </div>

        <Link
          href="/browse"
          className="mt-8 inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
        >
          Browse everything
        </Link>
      </main>

      <SiteFooter />
    </>
  );
}
