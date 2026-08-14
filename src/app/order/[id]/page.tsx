import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

/**
 * Where Stripe returns the buyer after checkout.
 *
 * Deliberately does NOT mark the order paid — only the signed webhook does
 * that. Landing here proves the buyer visited a URL, nothing more. If the
 * webhook hasn't arrived yet (usually a second or two) the page says so
 * plainly rather than inventing a status.
 */
export default async function OrderPage(props: PageProps<"/order/[id]">) {
  const { id } = await props.params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { title: true, slug: true } } } },
      grants: true,
    },
  });

  if (!order) notFound();

  const settled = order.status === OrderStatus.COMPLETED;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-16 text-center sm:py-24">
        {settled ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Payment received
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              You paid {formatPrice(order.totalPaidCents)}. The creator keeps{" "}
              {formatPrice(order.vendorShareCents)} of that.
            </p>

            <ul className="mt-8 space-y-3 text-left">
              {order.items.map((item) => {
                const grant = order.grants.find(
                  (g) => g.productId === item.productId,
                );
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {item.product.title}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {formatPrice(item.pricePaidCents)}
                      </p>
                    </div>
                    {grant && (
                      <Link
                        href={`/download/${grant.token}`}
                        className="shrink-0 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
                      >
                        Download
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Confirming your payment
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              This usually takes a couple of seconds. Refresh the page in a
              moment — your download will appear here once the payment is
              confirmed.
            </p>
          </>
        )}

        <Link
          href="/browse"
          className="mt-10 inline-block text-sm font-semibold text-brand hover:underline"
        >
          Keep browsing
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
