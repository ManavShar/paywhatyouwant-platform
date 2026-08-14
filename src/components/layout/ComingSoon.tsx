import Link from "next/link";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

/**
 * Honest placeholder for routes that are linked from the navigation but not
 * yet built. A stub that says what it is beats a 404 from a link we wrote
 * ourselves, and beats hiding the link and forgetting the page exists.
 */
export function ComingSoon({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-24 text-center sm:py-32">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          {note ?? "This part of the site is still being built."}
        </p>
        <Link
          href="/browse"
          className="mt-8 inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold hover:bg-surface-hover"
        >
          Browse the catalogue
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
