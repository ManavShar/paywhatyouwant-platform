import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductStatus } from "@prisma/client";
import { requireVendor } from "@/lib/auth";
import { getVendorAlbum } from "@/lib/vendor-queries-albums";
import { AlbumEditForm } from "@/components/vendor/AlbumEditForm";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit album" };

export default async function EditAlbumPage(
  props: PageProps<"/dashboard/albums/[id]">,
) {
  const { id } = await props.params;
  const user = await requireVendor();

  // Ownership is part of the query, not a check after it — a wrong id and
  // another creator's id have to be indistinguishable from here.
  const album = await getVendorAlbum(user.id, id);
  if (!album) notFound();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Edit {album.title}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          {album.status === ProductStatus.PUBLISHED
            ? "Live on the site."
            : "A draft — nobody can see it yet."}
        </p>
      </header>

      <AlbumEditForm
        album={{
          id: album.id,
          title: album.title,
          description: album.description,
          category: album.category,
          licence: album.licence,
          suggestedPriceCents: album.suggestedPriceCents,
          minimumPriceCents: album.minimumPriceCents,
          coverImageUrl: album.coverImageUrl,
        }}
      />

      {/* Membership and per-item prices are edited on each item's own page.
          Every member is a full product, so it already has an edit screen with
          its files, preview, tags and licence on it — duplicating a lesser
          version of that here would be the copy that goes stale. */}
      <section className="mt-10 max-w-3xl">
        <h2 className="text-sm font-semibold text-ink">
          What&apos;s in this album
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Each item is a product in its own right. Open one to change its price,
          replace its file or add a preview.
        </p>

        <ol className="mt-3 divide-y divide-hairline rounded-card border border-hairline">
          {album.items.map((item, index) => (
            <li
              key={item.productId}
              className="flex items-center gap-4 p-3 text-sm"
            >
              <span className="w-5 shrink-0 tabular-nums text-ink-subtle">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                {item.product.title}
              </span>
              <span className="shrink-0 text-ink-muted">
                {item.product.suggestedPriceCents === 0
                  ? "Name your price"
                  : `from ${formatPrice(item.product.suggestedPriceCents)}`}
              </span>
              <Link
                href={`/dashboard/products/${item.productId}`}
                className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-hover"
              >
                Edit
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
