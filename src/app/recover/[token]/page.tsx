import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { OrderStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { db } from "@/lib/db";
import { consumeEmailToken } from "@/lib/receipts";
import { createGrant } from "@/lib/downloads";
import { formatMoney } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your purchases",
  robots: { index: false, follow: false },
};

/**
 * What a recovery link opens.
 *
 * The token proves control of the address, so this page can hand over the
 * downloads bought with it. It lasts an hour and works for as long as it
 * lasts — see `consumeEmailToken` for why "single use" would have been a bug
 * rather than a safeguard.
 *
 * A usable grant is reused where one exists and a fresh one minted otherwise,
 * so a mail scanner opening the link does not quietly mint a second set of
 * grants for every purchase the person has ever made.
 */
export default async function RecoverTokenPage(
  props: PageProps<"/recover/[token]">,
) {
  const { token } = await props.params;
  const email = await consumeEmailToken(token, "recover");

  if (!email) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-16 text-center sm:py-24">
          <h1 className="text-2xl font-extrabold tracking-tight">
            That link has expired
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Recovery links last an hour. Ask for a new one and it will arrive in
            a moment.
          </p>
          <Link
            href="/recover"
            className="mt-6 inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
          >
            Send a new link
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  const orders = await db.order.findMany({
    where: { email, status: OrderStatus.COMPLETED },
    orderBy: { completedAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { id: true, title: true, slug: true } },
        },
      },
      album: { select: { title: true } },
    },
  });

  // Reuse a grant that still works; mint one only where none does. Minting
  // unconditionally meant every load — including an automated one — created a
  // new row for every item the person had ever bought.
  const links = new Map<string, string>();
  const now = new Date();
  for (const order of orders) {
    for (const item of order.items) {
      const usable = await db.downloadGrant.findFirst({
        where: {
          orderId: order.id,
          productId: item.productId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      const token =
        usable && usable.downloadCount < usable.maxDownloads
          ? usable.token
          : (
              await createGrant({
                productId: item.productId,
                orderId: order.id,
                email,
              })
            ).token;

      links.set(`${order.id}:${item.productId}`, token);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Everything bought with {email}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
          Links good for 30 days and ten downloads each. This page works for an
          hour from when the email was sent — ask for another link any time.
        </p>

        {orders.length === 0 ? (
          <p className="mt-8 text-[0.9375rem] text-ink-muted">
            There are no completed purchases for this address.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {orders.map((order) => (
              <section key={order.id}>
                <h2 className="text-sm font-semibold text-ink">
                  {order.album?.title ??
                    (order.items.length > 1
                      ? `${order.items.length} items`
                      : order.items[0]?.product.title)}
                </h2>
                <p className="mt-0.5 text-sm text-ink-subtle">
                  {formatMoney(order.totalPaidCents)} ·{" "}
                  {order.completedAt?.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>

                <ul className="mt-3 space-y-2">
                  {order.items.map((item) => {
                    const t = links.get(`${order.id}:${item.productId}`);
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-card border border-hairline bg-surface p-4"
                      >
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">
                          {item.product.title}
                        </span>
                        {t && (
                          <Link
                            href={`/download/${t}`}
                            className="inline-flex shrink-0 items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                            Download
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-sm leading-relaxed text-ink-subtle">
          Making an account keeps all of this in one place, so you never need a
          recovery link again.{" "}
          <Link href="/join" className="font-semibold text-brand hover:underline">
            Create one
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
