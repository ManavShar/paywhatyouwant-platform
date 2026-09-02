import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { RecoverForm } from "@/components/product/RecoverForm";

export const metadata: Metadata = {
  title: "Find your purchases",
  description:
    "Lost a download link? Enter the email you used and we will send it again.",
  robots: { index: false, follow: false },
};

/**
 * The way back for someone who bought without an account.
 *
 * Buying deliberately does not require signing up, which meant a guest's only
 * copy of a download link was the browser tab they bought in. Closing it lost
 * the purchase outright. This page, plus the receipt email, is what makes a
 * guest purchase survivable.
 */
export default function RecoverPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-16 sm:py-24">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Find your purchases
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          If you bought something without making an account, enter the email
          address you used. We will send you a link to everything you have
          bought, with fresh downloads.
        </p>

        <div className="mt-8">
          <RecoverForm />
        </div>

        <p className="mt-8 text-sm leading-relaxed text-ink-subtle">
          Signed in already? Everything you have bought is under{" "}
          <a href="/purchases" className="font-semibold text-brand hover:underline">
            Purchases
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
