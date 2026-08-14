import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConnectPayouts } from "@/components/vendor/ConnectPayouts";
import { isStripeConfigured, platformFeePercent } from "@/lib/stripe";
import { formatMoney } from "@/lib/utils";
import { getVendorStats } from "@/lib/vendor-queries";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage(props: PageProps<"/dashboard/payouts">) {
  const sp = await props.searchParams;
  const justReturned = sp.done === "1";

  const user = await requireVendor();
  const [record, stats] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { stripeAccountId: true, stripeOnboardingDone: true },
    }),
    getVendorStats(user.id),
  ]);

  const status = record.stripeOnboardingDone
    ? "ready"
    : record.stripeAccountId
      ? "incomplete"
      : "not-connected";

  const fee = platformFeePercent();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Payouts</h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          Where your money goes and how it gets to you.
        </p>
      </header>

      {justReturned && status !== "ready" && (
        <p
          role="status"
          className="mb-5 rounded-control border border-hairline bg-surface p-3 text-sm text-ink"
        >
          Thanks — Stripe is reviewing your details. This page updates as soon
          as they confirm, usually within a few minutes.
        </p>
      )}

      <div className="max-w-2xl space-y-5">
        <ConnectPayouts
          initialStatus={status}
          configured={isStripeConfigured()}
        />

        <div className="rounded-card border border-hairline p-5">
          <h2 className="text-sm font-semibold text-ink">How the split works</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Buyer pays</dt>
              <dd className="tabular-nums text-ink">whatever they choose</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Platform fee</dt>
              <dd className="tabular-nums text-ink">{fee}%</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-2">
              <dt className="font-semibold text-ink">You keep</dt>
              <dd className="font-semibold tabular-nums text-ink">
                {100 - fee}%
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Rounding always favours you — the fee is rounded down, so a
            half-cent goes to you rather than to us.
          </p>
        </div>

        <div className="rounded-card border border-hairline p-5">
          <h2 className="text-sm font-semibold text-ink">Earned so far</h2>
          <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight text-ink">
            {formatMoney(stats.earningsCents)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            across {stats.totalSales} {stats.totalSales === 1 ? "sale" : "sales"}
          </p>
        </div>
      </div>
    </div>
  );
}
