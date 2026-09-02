import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { ProductStatus } from "@prisma/client";
import { requireVendor } from "@/lib/auth";
import { getVendorProducts } from "@/lib/vendor-queries";
import { CATEGORY_BY_VALUE } from "@/lib/taxonomy";
import { formatPrice, cn, formatMoney } from "@/lib/utils";
import { ProductRowActions } from "@/components/vendor/ProductRowActions";

export const metadata: Metadata = { title: "Your products" };

export default async function VendorProductsPage(
  props: PageProps<"/dashboard/products">,
) {
  const sp = await props.searchParams;
  const created = Array.isArray(sp.created) ? sp.created[0] : sp.created;
  const updated = (Array.isArray(sp.updated) ? sp.updated[0] : sp.updated) === "1";

  const user = await requireVendor();
  const products = await getVendorProducts(user.id);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Your products</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">
            {products.length} {products.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Link
          href="/dashboard/products/new"
          className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add product
        </Link>
      </header>

      {/* A draft is not live, and saying it is at exactly the moment someone is
          checking whether their draft saved is the worst possible time to be
          vague. */}
      {(created || updated) && (
        <p
          role="status"
          className="mb-6 rounded-control border border-hairline bg-surface p-3 text-sm font-medium text-ink"
        >
          {created === "draft"
            ? "Saved as a draft. Nobody can see it until you publish it."
            : created === "live"
              ? "Saved. It's live on your page now."
              : "Changes saved."}
        </p>
      )}

      {products.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong py-20 text-center">
          <p className="font-semibold text-ink">Nothing here yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Your uploads will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline">
          {products.map((p) => {
            // Only a published product has a public page. Sending a draft to
            // `/product/<slug>` produced a 404 from a link we wrote ourselves.
            const href =
              p.status === ProductStatus.PUBLISHED
                ? `/product/${p.slug}`
                : `/dashboard/products/${p.id}`;

            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap sm:p-4"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                  {p.coverImageUrl && (
                    <Image
                      src={p.coverImageUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-[0.9375rem] font-semibold text-ink hover:underline"
                  >
                    {p.title}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">
                    {CATEGORY_BY_VALUE.get(p.category)?.label} ·{" "}
                    {p.suggestedPriceCents === 0
                      ? "Name your price"
                      : `from ${formatPrice(p.suggestedPriceCents)}`}
                  </p>
                  {p.status === ProductStatus.FLAGGED && p.flagReason && (
                    <p className="mt-1 text-xs text-warning">
                      Held for review — {p.flagReason}
                    </p>
                  )}
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(p.earningsCents)}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {p.salesCount} {p.salesCount === 1 ? "sale" : "sales"}
                  </p>
                </div>

                <StatusPill status={p.status} />

                <ProductRowActions
                  productId={p.id}
                  status={p.status}
                  sold={p._count.orderItems > 0}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: ProductStatus }) {
  const map = {
    [ProductStatus.PUBLISHED]: { label: "Live", cls: "text-success" },
    [ProductStatus.DRAFT]: { label: "Draft", cls: "text-ink-subtle" },
    [ProductStatus.FLAGGED]: { label: "In review", cls: "text-warning" },
  } as const;
  const { label, cls } = map[status];

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-hairline-strong px-2.5 py-1 text-xs font-semibold",
        cls,
      )}
    >
      {label}
    </span>
  );
}
