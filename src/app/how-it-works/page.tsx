import Link from "next/link";
import type { Metadata } from "next";
import { ContentPage, Section, List } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How buying and selling works on Paywhatyouwant.io — naming your own price, licences, downloads, and how creators get paid.",
};

export default function HowItWorksPage() {
  return (
    <ContentPage
      title="How it works"
      lede="Two short walkthroughs: one for buying, one for selling."
    >
      <Section title="If you're buying">
        <List>
          <li>
            <strong className="font-semibold text-ink">Find something.</strong>{" "}
            Browse by category or search. Every item shows what it is, who made
            it, and what they suggest.
          </li>
          <li>
            <strong className="font-semibold text-ink">Name your price.</strong>{" "}
            The creator&apos;s suggestion is pre-filled. Take it, pay more, pick
            one of the other amounts, or type your own. Some creators set a
            floor; most do not, and where there is none, free is genuinely on
            the table.
          </li>
          <li>
            <strong className="font-semibold text-ink">Pay, or don&apos;t.</strong>{" "}
            Anything above zero goes through Stripe. Your card details are
            entered on Stripe&apos;s own page and never touch this site. Choose
            zero and you skip payment entirely — the download is immediate.
          </li>
          <li>
            <strong className="font-semibold text-ink">Download it.</strong>{" "}
            Your link works for 30 days and up to ten downloads. If you were
            signed in, it is also waiting for you under{" "}
            <Link href="/purchases" className="font-semibold text-brand hover:underline">
              Purchases
            </Link>
            , where you can ask for a fresh link whenever you need one.
          </li>
        </List>
      </Section>

      <Section title="What you may do with what you buy">
        <p>
          That depends on the licence the creator chose, and it is stated on
          every product page and inside every embed:
        </p>
        <List>
          <li>
            <strong className="font-semibold text-ink">Creative Commons</strong>{" "}
            — share and adapt it, including commercially, as long as you credit
            the creator.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              Creative Commons — No Derivatives
            </strong>{" "}
            — share it with credit, but don&apos;t distribute modified versions.
          </li>
          <li>
            <strong className="font-semibold text-ink">All Rights Reserved</strong>{" "}
            — for your own personal use. Ask the creator about anything
            commercial.
          </li>
          <li>
            <strong className="font-semibold text-ink">Public Domain</strong> —
            no rights reserved. Do as you like, no credit required.
          </li>
        </List>
        <p>
          You do not need an account to buy. Having one means your purchases are
          kept together and your download links can be reissued.
        </p>
      </Section>

      <Section title="If you're selling">
        <List>
          <li>
            <strong className="font-semibold text-ink">Make an account</strong>{" "}
            and tick &ldquo;I want to sell my work&rdquo;. If you already have a
            buyer account, you can turn on the creator side from the{" "}
            <Link href="/sell" className="font-semibold text-brand hover:underline">
              Sell your work
            </Link>{" "}
            page without starting again.
          </li>
          <li>
            <strong className="font-semibold text-ink">Upload the work.</strong>{" "}
            The file people are buying stays private — it is never given a
            public address and can only be reached through a download link
            issued against a completed order. Add a cover image so it looks
            right in the catalogue, and a preview if you want people to hear or
            see a little first.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              Suggest a price, and set a floor if you want one.
            </strong>{" "}
            The suggestion is the number buyers see first, and it matters — it
            is the anchor the whole decision hangs on. Leave the minimum at zero
            to allow free.
          </li>
          <li>
            <strong className="font-semibold text-ink">Choose a licence</strong>{" "}
            from the four above. It is shown clearly wherever your work appears.
          </li>
          <li>
            <strong className="font-semibold text-ink">Publish</strong> — or save
            a draft and come back. Published work appears immediately on your
            page, in its category and in the catalogue. You can edit it,
            unpublish it, or take it down at any time.
          </li>
        </List>
      </Section>

      <Section title="Getting paid">
        <p>
          Connect your own Stripe account from the Payouts page in your
          dashboard. Once it is set up, buyers&apos; payments go to you
          directly, with our ten per cent taken automatically at the moment of
          sale. There is no payout request to make and nobody to email.
        </p>
        <p>
          Where the fee splits between two cents, the rounding favours you. At
          these amounts it is a trivial sum; it is the principle we would rather
          get right.
        </p>
      </Section>

      <Section title="Reaching people off the site">
        <p>
          Every product has an embed you can drop into a blog or a newsletter —
          it shows the work, plays the preview where there is one, and lets a
          reader pay without leaving the page they are on. Followers also see
          new work in their feed as soon as you publish it.
        </p>
      </Section>
    </ContentPage>
  );
}
