import Link from "next/link";
import type { Metadata } from "next";
import { ContentPage, Section, List, Note } from "@/components/layout/ContentPage";

export const metadata: Metadata = {
  title: "The research behind pay what you want",
  description:
    "Pay-what-you-want pricing has been studied in the field for over fifteen years. A summary of what economists have found, and why this marketplace is built on it.",
};

export default function ResearchPage() {
  return (
    <ContentPage
      title="The research behind pay what you want"
      lede="Letting people choose the price sounds like a way to be paid nothing. Fifteen years of field experiments say otherwise — and they say something more useful than that, too."
    >
      <Section title="The obvious objection">
        <p>
          If a buyer can pay nothing, why would they pay anything? It is the
          first question everyone asks, and it deserves a better answer than
          optimism. Fortunately it has been tested repeatedly, not in
          laboratories with undergraduates but in real shops, restaurants and
          cinemas, with real money.
        </p>
        <p>
          The consistent finding is that almost nobody behaves the way the
          objection predicts. Given the option to pay zero, most people
          don&apos;t. A meaningful share pay more than a seller would have dared
          to charge.
        </p>
      </Section>

      <Section title="What the field experiments found">
        <List>
          <li>
            <strong className="font-semibold text-ink">
              Free-riding is the exception, not the rule.
            </strong>{" "}
            Across field studies in restaurants, cinemas and delicatessens,
            average payments settled well above zero, and in some settings
            revenue held up against — or beat — conventional fixed pricing.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              Knowing who you are paying changes what you pay.
            </strong>{" "}
            Payments rise when the exchange feels like one between people rather
            than a transaction with a shopfront. Anonymity in either direction
            pushes them down.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              A suggested price does real work.
            </strong>{" "}
            What the seller proposes anchors the decision. Publishing a
            suggestion reliably lifts the average against publishing none — the
            number is not decoration, it is the frame the whole choice sits in.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              Volume goes up, and that is part of the economics.
            </strong>{" "}
            Removing the price barrier brings in people who would not have
            bought at all. Some pay little, some pay generously, and the
            audience is larger than a fixed price would have reached.
          </li>
          <li>
            <strong className="font-semibold text-ink">
              Fairness cuts both ways.
            </strong>{" "}
            People pay more when they judge the seller to be behaving decently,
            and less when they suspect the mechanism is a gimmick. Pay what you
            want works as a genuine offer and fails as a marketing device.
          </li>
        </List>
      </Section>

      <Section title="Where this has been seen outside the lab">
        <p>
          Radiohead released <em>In Rainbows</em> in 2007 as a pay-what-you-want
          download, and enough people paid — many of whom could have paid
          nothing — for the experiment to be widely regarded as a success rather
          than a stunt. Humble Bundle has since run pay-what-you-want at scale
          for years, splitting payments between creators and charity. Neither is
          a controlled study, but both are large, public and long-running, and
          both point the same way as the academic work.
        </p>
      </Section>

      <Section title="Why this marketplace is built this way">
        <p>
          The research does not say &ldquo;charge nothing and hope&rdquo;. It
          says something more specific, and the design here follows it directly:
        </p>
        <List>
          <li>
            Every creator publishes a <strong className="font-semibold text-ink">suggested price</strong>, shown
            pre-filled, because the suggestion is what the decision anchors on.
          </li>
          <li>
            Every item is attached to a{" "}
            <strong className="font-semibold text-ink">named creator with a page of their own</strong>, because
            paying a person is not the same as paying a shop.
          </li>
          <li>
            <strong className="font-semibold text-ink">Free is offered without friction or guilt.</strong>{" "}
            Someone who cannot pay should not have to feel watched deciding not
            to — and treating them badly is how the mechanism stops working for
            everyone else.
          </li>
          <li>
            The platform takes a{" "}
            <strong className="font-semibold text-ink">flat ten per cent</strong>, rounded in the creator&apos;s
            favour, so the incentives stay legible to both sides.
          </li>
        </List>
      </Section>

      <Section title="Sources">
        <p>
          The literature is larger than this, but these are the studies most
          often cited as the foundation:
        </p>
        <List>
          <li>
            Kim, J.-Y., Natter, M., &amp; Spann, M. (2009). &ldquo;Pay What You
            Want: A Participative New Pricing Mechanism.&rdquo;{" "}
            <em>Journal of Marketing</em>, 73(1). Field experiments in a
            restaurant, a cinema and a delicatessen.
          </li>
          <li>
            Gneezy, A., Gneezy, U., Nelson, L. D., &amp; Brown, A. (2010).
            &ldquo;Shared Social Responsibility: A Field Experiment in
            Pay-What-You-Want Pricing and Charitable Giving.&rdquo;{" "}
            <em>Science</em>, 329(5989). A large field experiment run by
            behavioural economists at the University of California.
          </li>
          <li>
            Riener, G., &amp; Traxler, C. (2012). &ldquo;Norms, moods, and free
            lunch: Longitudinal evidence on payments from a pay-what-you-want
            restaurant.&rdquo; <em>Journal of Socio-Economics</em>, 41(4).
          </li>
        </List>
      </Section>

      <Note>
        <p>
          If you have read further into this than we have — and some of you
          will have — we would rather be corrected than be confidently wrong.
          Tell us what we have mischaracterised and we will fix the page.
        </p>
      </Note>

      <Section title="Try it">
        <p>
          The most direct way to understand pay what you want is to be offered
          it.{" "}
          <Link href="/browse" className="font-semibold text-brand hover:underline">
            Browse the catalogue
          </Link>{" "}
          and see what you decide.
        </p>
      </Section>
    </ContentPage>
  );
}
