import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

/**
 * Shell for the written pages — about, how it works, the research, terms,
 * privacy.
 *
 * These were `ComingSoon` stubs, which was honest but a dead end from links we
 * wrote ourselves. They share a shell rather than each rolling their own so
 * the measure, rhythm and heading weights stay identical across all five; a
 * legal page that looks like a different website is its own small signal that
 * nobody is minding it.
 *
 * `max-w-[68ch]` rather than a pixel width: line length is the thing that
 * governs readability in running text, and it should hold whatever the reader
 * has done to their font size.
 */
export function ContentPage({
  title,
  lede,
  updated,
  children,
}: {
  title: string;
  lede?: string;
  /** Shown under the title on documents where currency matters. */
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader showSearch={false} />
      <main className="mx-auto w-full max-w-[68ch] px-4 py-14 sm:px-6 sm:py-20">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>

        {lede && (
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">{lede}</p>
        )}

        {updated && (
          <p className="mt-4 text-sm text-ink-subtle">Last updated {updated}</p>
        )}

        <div className="mt-10 space-y-10">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

/** One titled section of a written page. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
      <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

/** A bulleted list in the same measure and colour as the surrounding prose. */
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 marker:text-ink-subtle">
      {children}
    </ul>
  );
}

/** Pulled-out note — a caveat or an aside that shouldn't read as body text. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-5 text-[0.9375rem] leading-relaxed text-ink-muted">
      {children}
    </div>
  );
}
