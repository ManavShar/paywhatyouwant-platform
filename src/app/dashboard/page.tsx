import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { getVendorStats, getMonthlyEarnings } from "@/lib/vendor-queries";
import { EarningsChart } from "@/components/vendor/EarningsChart";
import { StatTile } from "@/components/vendor/StatTile";
import { formatCount, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardOverview() {
  const user = (await currentUser())!; // layout guarantees a vendor here

  const [stats, monthly] = await Promise.all([
    getVendorStats(user.id),
    getMonthlyEarnings(user.id),
  ]);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">
            Everything you&apos;ve made, and what people chose to pay.
          </p>
        </div>
        <Link
          href="/dashboard/products/new"
          className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add product
        </Link>
      </header>

      {/* Earnings first: it is the number a vendor opens this page to see.
          The old dashboard led with five equal tiles and buried it. */}
      <section className="mb-8">
        <div className="rounded-card border border-hairline p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink-muted">
                Your earnings
              </h2>
              <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
                {formatMoney(stats.earningsCents)}
              </p>
            </div>
            <p className="text-sm text-ink-subtle">Last 12 months</p>
          </div>
          <EarningsChart data={monthly} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sales" value={formatCount(stats.totalSales)} />
        <StatTile
          label="Products"
          value={String(stats.products)}
          hint={
            stats.products === stats.published
              ? "all published"
              : `${stats.published} published`
          }
        />
        <StatTile label="Page views" value={formatCount(stats.pageViews)} />
        <StatTile
          label="Buyers who paid"
          value={
            stats.totalSales > 0
              ? formatMoney(Math.round(stats.grossCents / stats.totalSales))
              : "—"
          }
          hint="average per sale"
        />
      </section>

      {stats.products === 0 && (
        <section className="mt-8 rounded-card border border-dashed border-hairline-strong p-8 text-center">
          <p className="font-semibold text-ink">Nothing up yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            Upload your first piece of work, set a suggested price, and let
            people decide what it&apos;s worth to them.
          </p>
          <Link
            href="/dashboard/products/new"
            className="mt-5 inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
          >
            Add your first product
          </Link>
        </section>
      )}
    </div>
  );
}
