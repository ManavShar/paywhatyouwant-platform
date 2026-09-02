"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Something threw while rendering a page.
 *
 * A client component by necessity — Next needs `reset` to be callable from the
 * browser — which is why it does not use `SiteHeader`: that is an async server
 * component and cannot be imported here. The markup is deliberately plain and
 * self-contained, because whatever just failed may well be the thing the
 * header depends on.
 *
 * It says nothing about what went wrong. The error text is for the logs, not
 * for a buyer: it is meaningless to them and occasionally reveals more about
 * the system than it should. The digest is shown because it is the one thing
 * that makes a support message actionable — "error c7f3a1" can be found in the
 * logs, "it broke" cannot.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the server logs today. When error tracking is added, this is the
    // one line that has to change.
    console.error("Unhandled page error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
        This page didn&apos;t load properly. Trying again usually works — the
        fault is on our side, not yours.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold text-ink hover:bg-surface-hover"
        >
          Back to the homepage
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 text-xs text-ink-subtle">
          If you need to tell us about it, quote{" "}
          <span className="font-mono">{error.digest}</span>.
        </p>
      )}
    </main>
  );
}
