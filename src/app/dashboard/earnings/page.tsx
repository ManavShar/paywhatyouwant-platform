import type { Metadata } from "next";
import { requireVendor } from "@/lib/auth";
import { getVendorStats, getMonthlyEarnings } from "@/lib/vendor-queries";
import { EarningsChart } from "@/components/vendor/EarningsChart";
import { StatTile } from "@/components/vendor/StatTile";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage() {
  const user = await requireVendor();
  const [stats, monthly] = await Promise.all([
    getVendorStats(user.id),
    getMonthlyEarnings(user.id),
  ]);

  const platformCents = stats.grossCents - stats.earningsCents;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Earnings</h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          Paid straight to your own Stripe account. No emailing anyone to
          request a payout.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="You earned" value={formatMoney(stats.earningsCents)} />
        <StatTile
          label="Buyers paid"
          value={formatMoney(stats.grossCents)}
          hint="before platform fee"
        />
        <StatTile label="Platform fee" value={formatMoney(platformCents)} />
      </section>

      <section className="mb-8 rounded-card border border-hairline p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-muted">
          Month by month
        </h2>
        <EarningsChart data={monthly} />
      </section>

      {/* The table is the accessible counterpart to the chart, and the thing
          you actually want when reconciling a figure. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">
          The same figures as a table
        </h2>
        <div className="overflow-x-auto rounded-card border border-hairline">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-subtle">
                <th className="p-3 font-semibold">Month</th>
                <th className="p-3 text-right font-semibold">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {monthly.map((m) => (
                <tr key={m.fullLabel}>
                  <td className="p-3 text-ink">{m.fullLabel}</td>
                  <td className="p-3 text-right tabular-nums text-ink">
                    {formatMoney(m.cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
