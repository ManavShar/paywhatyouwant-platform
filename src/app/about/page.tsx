import Link from "next/link";
import type { Metadata } from "next";
import { ContentPage, Section } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "About",
  description:
    "Paywhatyouwant.io is a digital marketplace where the buyer decides the price. Founded by Max Rangeley, based in England.",
};

export default function AboutPage() {
  return (
    <ContentPage
      title="About"
      lede="A marketplace where the person buying decides what the work is worth."
    >
      <Section title="The idea">
        <p>
          Most marketplaces begin with a price and ask you to accept it. This
          one begins with a suggestion and asks what you think. The creator
          names a figure, and you can pay it, pay more, or pay nothing at all —
          and taking the free option is a real choice here, not a trick or a
          trial.
        </p>
        <p>
          That sounds like a way to lose money. In practice it is not, and the
          reason has been studied properly by economists for the better part of
          two decades: when people can see whose work they are taking and feel
          the exchange is fair, a great many of them pay, and a surprising
          number pay more than a fixed price would ever have asked of them.
        </p>
      </Section>

      <Section title="What's on it">
        <p>
          Photography, music, podcasts, digital art and ebooks — work by
          independent creators, sold directly by them. Every item states its
          licence plainly on the page, so you know what you are allowed to do
          with it before you decide what it is worth to you.
        </p>
      </Section>

      <Section title="How we make money">
        <p>
          We take ten per cent of whatever a buyer chooses to pay. That is the
          whole model — no listing fees, no subscription, no charge for having
          your work here. When the rounding falls between two cents, it goes to
          the creator rather than to us.
        </p>
        <p>
          Payments go to the creator&apos;s own Stripe account rather than
          sitting on our books waiting to be released. Nobody has to email
          anyone to be paid what they have earned.
        </p>
      </Section>

      <Section title="Who runs it">
        <p>
          Paywhatyouwant.io was founded by Max Rangeley and is based in England.
        </p>
      </Section>

      <Section title="Start somewhere">
        <p>
          <Link href="/browse" className="font-semibold text-brand hover:underline">
            Browse the catalogue
          </Link>
          , read{" "}
          <Link href="/how-it-works" className="font-semibold text-brand hover:underline">
            how it works
          </Link>{" "}
          for buyers and creators, or look at{" "}
          <Link href="/research" className="font-semibold text-brand hover:underline">
            the research behind pay what you want
          </Link>
          . If you make things,{" "}
          <Link href="/sell" className="font-semibold text-brand hover:underline">
            put them up
          </Link>
          .
        </p>
      </Section>
    </ContentPage>
  );
}
