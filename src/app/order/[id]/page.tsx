import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OrderStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/utils";
import { OrderPoller } from "@/components/product/OrderPoller";

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
 *
 * **Who may see the download links.** This page cannot require a session:
 * Stripe redirects guests here and buying without an account is the point. So
 * for a guest order the order id is the secret, exactly as a download token is
 * — that is the deal guest checkout makes.
 *
 * But an order placed *by an account* is a different matter, and it used to be
 * readable by anyone who had the id: the page handed out working download
 * links with no session at all. Where there is an account to check against, it
 * is now checked, and a stranger gets the receipt without the goods.
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

  // A guest order has nobody to authenticate, so the URL is the credential.
  // An account order authenticates.
  const viewer = await requireUser();
  const mayDownload = !order.buyerId || viewer?.id === order.buyerId;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-16 text-center sm:py-24">
        {settled ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Payment received
            </h1>
            {/* `formatMoney`, not `formatPrice`: the latter renders 0 as
                "Free", which is the right word when *offering* something and
                nonsense on a receipt — a free download used to be confirmed
                with "You paid Free. The creator keeps Free of that." */}
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              You paid {formatMoney(order.totalPaidCents)}. The creator keeps{" "}
              {formatMoney(order.vendorShareCents)} of that.
            </p>

            <ul className="mt-8 space-y-3 text-left">
              {order.items.map((item) => {
                const grant = mayDownload
                  ? order.grants.find((g) => g.productId === item.productId)
                  : undefined;
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
                        {formatMoney(item.pricePaidCents)}
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

            {/* Someone holding the link who is not the buyer. Say why rather
                than showing a list with no buttons and letting them guess. */}
            {!mayDownload && (
              <p className="mt-6 text-sm leading-relaxed text-ink-muted">
                This order belongs to an account.{" "}
                <Link href="/signin?next=/purchases" className="font-semibold text-brand hover:underline">
                  Sign in
                </Link>{" "}
                as the buyer to download it, or{" "}
                <Link href="/recover" className="font-semibold text-brand hover:underline">
                  have the links emailed
                </Link>{" "}
                to the address that bought it.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Confirming your payment
            </h1>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
              This usually takes a couple of seconds. Your download will appear
              here as soon as the payment is confirmed — no need to refresh.
            </p>
            <OrderPoller />
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
