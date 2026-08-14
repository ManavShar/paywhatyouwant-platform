import Link from "next/link";
import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { getVendorOrders } from "@/lib/vendor-queries";
import { formatPrice, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

export default async function VendorOrdersPage() {
  const user = (await currentUser())!;
  const orders = await getVendorOrders(user.id);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Orders</h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          What each buyer actually chose to pay, next to what you suggested.
        </p>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong py-20 text-center">
          <p className="font-semibold text-ink">No orders yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            They&apos;ll show up here the moment someone buys.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-subtle">
                <th className="p-3 font-semibold">Product</th>
                <th className="p-3 font-semibold">Date</th>
                <th className="p-3 text-right font-semibold">Suggested</th>
                <th className="p-3 text-right font-semibold">Paid</th>
                <th className="p-3 text-right font-semibold">You earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {orders.map((o) => {
                const delta = o.pricePaidCents - o.suggestedPriceCents;
                return (
                  <tr key={o.id}>
                    <td className="max-w-[220px] p-3">
                      <Link
                        href={`/product/${o.product.slug}`}
                        className="block truncate font-medium text-ink hover:underline"
                      >
                        {o.product.title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap p-3 text-ink-muted">
                      {o.order.completedAt?.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }) ?? "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums text-ink-muted">
                      {formatMoney(o.suggestedPriceCents)}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-ink">
                      {formatPrice(o.pricePaidCents)}
                      {/* The gap between suggested and paid is the most
                          interesting number this platform produces, so it is
                          shown rather than left to be worked out. */}
                      {delta !== 0 && (
                        <span
                          className={
                            delta > 0
                              ? "ml-1.5 text-xs font-medium text-success"
                              : "ml-1.5 text-xs font-medium text-ink-subtle"
                          }
                        >
                          {/* Both signs are explicit. Rendering a shortfall as
                              a bare "$4.50" reads as though they paid it. */}
                          {delta > 0 ? "+" : "−"}
                          {formatMoney(Math.abs(delta))}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-ink">
                      {formatMoney(o.vendorShareCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
