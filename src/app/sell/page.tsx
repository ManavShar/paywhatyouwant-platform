import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  title: "Sell your work",
  description:
    "Put your music, photography, podcasts, digital art or ebooks on Paywhatyouwant.io and let people decide what your work is worth.",
};

/**
 * The creator pitch. Secondary audience, so it lives on its own page rather
 * than competing with the catalogue on the homepage — but it has to be
 * genuinely persuasive, because a marketplace with no supply is nothing.
 */
export default function SellPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Let people decide what your work is worth
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          You set a suggested price. Buyers can pay it, pay more, or pay
          nothing. In practice a lot of people pay more than you&apos;d expect —
          that is the whole finding behind pay what you want.
        </p>

        <div className="mt-12 space-y-8">
          <Step n={1} title="Upload your work">
            Music, photographs, podcasts, digital art, ebooks. Add a preview so
            people can hear or see a little before they decide.
          </Step>
          <Step n={2} title="Set a suggested price">
            This is the number buyers see first, pre-filled. You can set a floor
            if you want one, or allow free.
          </Step>
          <Step n={3} title="Choose your licence">
            Creative Commons, All Rights Reserved, or Public Domain. It is shown
            clearly on your product page and inside every embed.
          </Step>
          <Step n={4} title="Embed it anywhere">
            Drop your work onto blogs and social media with a player that lets
            people pay without leaving the page.
          </Step>
          <Step n={5} title="Get paid directly">
            Payments go straight to your own Stripe account. No emailing anyone
            to request a payout.
          </Step>
        </div>

        <div className="mt-14 rounded-card border border-hairline bg-surface p-6">
          <h2 className="text-lg font-bold tracking-tight">
            Why would anyone pay if they don&apos;t have to?
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">
            It is a fair question, and it has been studied properly — at
            Berkeley among other universities. When people can see who they are
            paying and feel the exchange is fair, a large share choose to pay,
            and often more than a fixed price would have captured. That research
            is the foundation this platform is built on.
          </p>
          <Link
            href="/research"
            className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Read the research
          </Link>
        </div>

        <div className="mt-12">
          <Link
            href="/join"
            className="inline-flex h-12 items-center rounded-control bg-brand px-6 font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
          >
            Create a creator account
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">
        {n}
      </span>
      <div>
        <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">
          {children}
        </p>
      </div>
    </div>
  );
}
