import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { checkGrant } from "@/lib/downloads";
import { LICENCES } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Your download",
  robots: { index: false, follow: false },
};

/**
 * The page a buyer lands on after paying — or after choosing to pay nothing.
 *
 * Both land here and are treated identically. Someone who took the free option
 * gets the same thanks and the same page as someone who paid ten dollars; the
 * model does not work if the free path feels like a lesser one.
 */
export default async function DownloadPage(
  props: PageProps<"/download/[token]">,
) {
  const { token } = await props.params;
  const result = await checkGrant(token);

  if (!result.ok) {
    if (result.reason === "not-found") notFound();

    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {result.reason === "revoked"
              ? "This purchase was refunded"
              : result.reason === "expired"
                ? "This link has expired"
                : "This link has been used up"}
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            {result.reason === "revoked"
              ? "The payment for this was returned, so the download was withdrawn with it. If you think that is wrong, get in touch and we will look into it."
              : "Download links last 30 days and ten downloads. What you bought is still yours: signed in, it's under your purchases — and if you bought as a guest, we can email you a fresh link."}
          </p>
          {/* Sending people to a "get in touch" that leads to a stub was worse
              than useless at the exact moment they needed help. */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/purchases"
              className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
            >
              Your purchases
            </Link>
            {/* The guest route. Without this, someone who bought without an
                account hit a page telling them to check "your purchases",
                which requires the account they do not have. */}
            <Link
              href="/recover"
              className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold hover:bg-surface-hover"
            >
              Email me a new link
            </Link>
            <Link
              href="/browse"
              className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold hover:bg-surface-hover"
            >
              Back to browsing
            </Link>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const { grant } = result;
  const licence = LICENCES[grant.product.licence];
  const remaining = grant.maxDownloads - grant.downloadCount;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-16 text-center sm:py-24">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Thank you — it&apos;s yours
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          <strong className="font-semibold text-ink">
            {grant.product.title}
          </strong>{" "}
          is ready to download.
        </p>

        <a
          href={`/api/download/${grant.token}`}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-control bg-brand px-6 font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
        >
          <Download className="h-5 w-5" aria-hidden />
          Download
        </a>

        <p className="mt-4 text-xs text-ink-subtle">
          This link works for {remaining} more{" "}
          {remaining === 1 ? "download" : "downloads"} over the next 30 days.
        </p>

        <div className="mt-10 rounded-card border border-hairline bg-surface p-5 text-left">
          <p className="text-sm font-semibold text-ink">{licence.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {licence.description}
          </p>
        </div>

        <Link
          href={`/product/${grant.product.slug}`}
          className="mt-8 inline-block text-sm font-semibold text-brand hover:underline"
        >
          Back to the product page
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
