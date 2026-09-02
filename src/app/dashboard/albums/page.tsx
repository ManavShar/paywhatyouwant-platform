import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Layers } from "lucide-react";
import { ProductStatus } from "@prisma/client";
import { requireVendor } from "@/lib/auth";
import { getVendorAlbums } from "@/lib/vendor-queries-albums";
import { CATEGORY_BY_VALUE } from "@/lib/taxonomy";
import { formatPrice, cn, formatMoney } from "@/lib/utils";
import { AlbumRowActions } from "@/components/vendor/AlbumRowActions";

export const metadata: Metadata = { title: "Your albums" };

export default async function VendorAlbumsPage(
  props: PageProps<"/dashboard/albums">,
) {
  const sp = await props.searchParams;
  const created = Array.isArray(sp.created) ? sp.created[0] : sp.created;
  const updated = (Array.isArray(sp.updated) ? sp.updated[0] : sp.updated) === "1";

  const user = await requireVendor();
  const albums = await getVendorAlbums(user.id);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Your albums</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-muted">
            {albums.length} {albums.length === 1 ? "collection" : "collections"}
          </p>
        </div>
        <Link
          href="/dashboard/albums/new"
          className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create album
        </Link>
      </header>

      {(created || updated) && (
        <p
          role="status"
          className="mb-6 rounded-control border border-hairline bg-surface p-3 text-sm font-medium text-ink"
        >
          {created === "draft"
            ? "Saved as a draft. Nobody can see it until you publish it."
            : created === "live"
              ? "Published. The album and everything in it are live."
              : "Changes saved."}
        </p>
      )}

      {albums.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong py-16 text-center">
          <Layers className="mx-auto h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="mt-3 font-semibold text-ink">No albums yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
            An album sells a whole collection for one price, while still letting
            people buy any single item from it on its own.
          </p>
          <Link
            href="/dashboard/albums/new"
            className="mt-4 inline-flex h-10 items-center rounded-control border border-hairline-strong px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
          >
            Create your first album
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-card border border-hairline">
          {albums.map((a) => {
            // Only a published album has a public page; a draft goes to its
            // own edit screen rather than a 404 from a link we wrote.
            const href =
              a.status === ProductStatus.PUBLISHED
                ? `/album/${a.slug}`
                : `/dashboard/albums/${a.id}`;

            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap sm:p-4"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                  {a.coverImageUrl ? (
                    <Image
                      src={a.coverImageUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-subtle">
                      <Layers className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-[0.9375rem] font-semibold text-ink hover:underline"
                  >
                    {a.title}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-ink-muted">
                    {a._count.items}{" "}
                    {a._count.items === 1 ? "item" : "items"} ·{" "}
                    {CATEGORY_BY_VALUE.get(a.category)?.label} ·{" "}
                    {a.suggestedPriceCents === 0
                      ? "Name your price"
                      : `from ${formatPrice(a.suggestedPriceCents)}`}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(a.earningsCents)}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {a.salesCount} {a.salesCount === 1 ? "sale" : "sales"}
                  </p>
                </div>

                <StatusPill status={a.status} />

                <AlbumRowActions
                  albumId={a.id}
                  status={a.status}
                  itemCount={a._count.items}
                  sold={a._count.orders > 0}
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
