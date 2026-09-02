import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { OrderStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { ReissueButton } from "@/components/product/ReissueButton";

export const metadata: Metadata = {
  title: "Your purchases",
  robots: { index: false, follow: false },
};

/**
 * Everything this account has bought, free downloads included.
 *
 * Before this page existed, a purchase lived only in the tab it was made in.
 * Orders carried no buyer and no email, so a closed window or an expired link
 * meant the file was gone with no way to prove it had ever been bought — on a
 * site whose free option makes "I'll grab it properly later" the normal case.
 */
export default async function PurchasesPage() {
  const user = await requireUser();
  if (!user) redirect("/signin?next=/purchases");

  const orders = await db.order.findMany({
    where: { buyerId: user.id, status: OrderStatus.COMPLETED },
    orderBy: { completedAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              title: true,
              coverImageUrl: true,
              vendor: { select: { username: true, name: true } },
            },
          },
        },
      },
      grants: true,
    },
  });

  if (orders.length === 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Nothing here yet
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Anything you download — paid for or not — shows up here, and you can
            get a fresh link whenever you need one.
          </p>
          <Link
            href="/browse"
            className="mt-8 inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
          >
            Find something
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Your purchases
        </h1>
        <p className="mt-2 text-[0.9375rem] text-ink-muted">
          Download links last 30 days. When one runs out, ask for another —
          what you bought is yours.
        </p>

        <ul className="mt-8 space-y-4">
          {orders.flatMap((order) =>
            order.items.map((item) => {
              // A link is only offered while it would actually work; otherwise
              // the button asks for a new one rather than sending someone to a
              // page that tells them off.
              const usable = order.grants.find(
                (g) =>
                  g.productId === item.productId &&
                  g.expiresAt > now &&
                  g.downloadCount < g.maxDownloads,
              );

              return (
                <li
                  key={item.id}
                  className="flex items-center gap-4 rounded-card border border-hairline p-4"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface">
                    {item.product.coverImageUrl && (
                      <Image
                        src={item.product.coverImageUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${item.product.slug}`}
                      className="block truncate text-[0.9375rem] font-semibold text-ink hover:underline"
                    >
                      {item.product.title}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-ink-muted">
                      {item.product.vendor.name ||
                        item.product.vendor.username}{" "}
                      · {formatPrice(item.pricePaidCents)}
                      {order.completedAt &&
                        ` · ${order.completedAt.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`}
                    </p>
                  </div>

                  {usable ? (
                    <Link
                      href={`/download/${usable.token}`}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Download
                    </Link>
                  ) : (
                    <ReissueButton
                      orderId={order.id}
                      productId={item.productId}
                    />
                  )}
                </li>
              );
            }),
          )}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
