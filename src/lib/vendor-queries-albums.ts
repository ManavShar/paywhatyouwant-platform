import { db } from "./db";

/**
 * Album reads for the dashboard.
 *
 * Separate file rather than more lines in `vendor-queries.ts` only because
 * that module is already long; the same rule applies here and is the important
 * one — every query takes a vendorId and filters on it, so a dashboard read
 * cannot return another creator's rows.
 */
export async function getVendorAlbums(vendorId: string) {
  return db.album.findMany({
    where: { vendorId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      category: true,
      coverImageUrl: true,
      suggestedPriceCents: true,
      salesCount: true,
      earningsCents: true,
      createdAt: true,
      _count: { select: { items: true, orders: true } },
    },
  });
}

/** One album, for the edit form. Null if it is not this creator's. */
export async function getVendorAlbum(vendorId: string, albumId: string) {
  return db.album.findFirst({
    where: { id: albumId, vendorId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          product: {
            select: {
              slug: true,
              title: true,
              suggestedPriceCents: true,
              status: true,
            },
          },
        },
      },
    },
  });
}
