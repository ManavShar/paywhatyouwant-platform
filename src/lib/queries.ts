import { unstable_cache } from "next/cache";
import { Category, ProductStatus, Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Shared read queries.
 *
 * Everything public filters on `status: PUBLISHED`. Imported items held for
 * review are FLAGGED and must never leak into a listing — that guarantee is
 * what made it safe to import questionable records rather than discard them.
 */

const PUBLIC_WHERE = { status: ProductStatus.PUBLISHED } as const;

/**
 * What a *listing* shows: published, and not a member of an album.
 *
 * A ten-track album would otherwise take eleven slots on the wall — itself
 * plus every track — and one creator publishing a collection would push
 * everyone else off the homepage. Listings show the album; the tracks are
 * reachable from it, from the creator's page, and by search.
 *
 * Deliberately *not* folded into `PUBLIC_WHERE`: `getProductBySlug` uses that,
 * and a track whose own page 404s because it belongs to an album would break
 * the individual purchase the client specifically asked for.
 */
const LISTING_WHERE = {
  ...PUBLIC_WHERE,
  albumItems: { none: {} },
} satisfies Prisma.ProductWhereInput;

/** The shape every card needs, and nothing more. */
export const cardSelect = {
  slug: true,
  title: true,
  coverImageUrl: true,
  suggestedPriceCents: true,
  category: true,
  vendor: { select: { username: true, name: true } },
} satisfies Prisma.ProductSelect;

export async function getFeaturedProducts(limit = 24) {
  return db.product.findMany({
    where: { ...LISTING_WHERE, coverImageUrl: { not: null } },
    select: cardSelect,
    orderBy: [{ salesCount: "desc" }, { viewCount: "desc" }],
    take: limit,
  });
}

export async function getLatestProducts(limit = 12, category?: Category) {
  return db.product.findMany({
    where: { ...LISTING_WHERE, ...(category ? { category } : {}) },
    select: cardSelect,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

export type BrowseFilters = {
  q?: string;
  category?: Category;
  freeOnly?: boolean;
  sort?: "newest" | "popular" | "price-low";
  page?: number;
  perPage?: number;
};

export async function browseProducts(filters: BrowseFilters) {
  const perPage = filters.perPage ?? 48;
  const page = Math.max(1, filters.page ?? 1);

  // Searching is the exception to hiding album members: someone typing a
  // track name is looking for that track, not for the album it sits in.
  const where: Prisma.ProductWhereInput = filters.q
    ? { ...PUBLIC_WHERE }
    : { ...LISTING_WHERE };

  if (filters.category) where.category = filters.category;

  // `freeOnly` means the creator suggests nothing — take it or leave it free.
  if (filters.freeOnly) where.suggestedPriceCents = 0;

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      { vendor: { name: { contains: q, mode: "insensitive" } } },
      { vendor: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "popular"
      ? [{ salesCount: "desc" }, { viewCount: "desc" }]
      : filters.sort === "price-low"
        ? [{ suggestedPriceCents: "asc" }]
        : [{ publishedAt: "desc" }];

  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      select: cardSelect,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  return { items, total, page, perPage, pageCount: Math.ceil(total / perPage) };
}

export async function getProductBySlug(slug: string) {
  return db.product.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    include: {
      vendor: {
        select: {
          username: true,
          name: true,
          bio: true,
          avatarUrl: true,
          followerCount: true,
          productCount: true,
          vendorSince: true,
        },
      },
      files: true,
      tags: { include: { tag: true } },
    },
  });
}

export async function getRelatedProducts(
  productSlug: string,
  category: Category,
  limit = 10,
) {
  return db.product.findMany({
    where: { ...LISTING_WHERE, category, slug: { not: productSlug } },
    select: cardSelect,
    orderBy: { salesCount: "desc" },
    take: limit,
  });
}

/** Creators with published work, most productive first — for the homepage rail. */
export async function getFeaturedVendors(limit = 8) {
  return db.user.findMany({
    where: { productCount: { gt: 0 } },
    select: {
      username: true,
      name: true,
      avatarUrl: true,
      productCount: true,
      products: {
        where: LISTING_WHERE,
        select: { coverImageUrl: true, slug: true },
        orderBy: { salesCount: "desc" },
        take: 3,
      },
    },
    orderBy: [{ productCount: "desc" }, { totalSales: "desc" }],
    take: limit,
  });
}

/**
 * How many published items sit in each category.
 *
 * Entries rather than a Map, for the same JSON-serialisation reason as the
 * covers below. Nothing displays this while `SHOW_CATALOGUE_COUNTS` is off,
 * but the query stays because the flag is meant to be flipped back.
 */
export async function getCategoryCountEntries() {
  const rows = await db.product.groupBy({
    by: ["category"],
    where: LISTING_WHERE,
    _count: { _all: true },
  });
  return rows.map((r) => [r.category, r._count._all] as [Category, number]);
}

/**
 * One representative cover per category, for the browse tiles.
 *
 * Entries rather than a Map because the homepage reads this through
 * `unstable_cache`, which stores its value as JSON — a Map would come back
 * from the cache as `{}`. The caller builds the Map.
 */
export async function getCategoryCoverEntries() {
  const found = await Promise.all(
    Object.values(Category).map(async (category) => {
      const p = await db.product.findFirst({
        where: { ...LISTING_WHERE, category, coverImageUrl: { not: null } },
        select: { coverImageUrl: true },
        orderBy: { salesCount: "desc" },
      });
      return [category, p?.coverImageUrl ?? null] as const;
    }),
  );

  return found.filter((e): e is readonly [Category, string] => e[1] !== null);
}

/* --------------------------------------------------------------- albums ----

   An album is a second kind of thing the catalogue can show. It carries the
   same fields a card needs, so listings merge the two into one wall rather
   than segregating collections into a rail of their own — the client asked for
   the collection to be the primary item, and a card in a sidebar is not that.
--------------------------------------------------------------------------- */

const ALBUM_PUBLIC_WHERE = { status: ProductStatus.PUBLISHED } as const;

export const albumCardSelect = {
  slug: true,
  title: true,
  coverImageUrl: true,
  suggestedPriceCents: true,
  category: true,
  vendor: { select: { username: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.AlbumSelect;

/** What a card renders, whichever of the two things it is. */
export type CatalogueCard = {
  kind: "product" | "album";
  slug: string;
  title: string;
  coverImageUrl: string | null;
  suggestedPriceCents: number;
  category: Category;
  vendor: { username: string; name: string | null };
  /** Albums only: how many items are inside. */
  itemCount?: number;
};

/** Sort keys travel alongside the card so a merged list can be ordered. */
type Sortable = CatalogueCard & {
  salesCount: number;
  publishedAt: Date | null;
};

const productSortSelect = {
  ...cardSelect,
  salesCount: true,
  publishedAt: true,
} satisfies Prisma.ProductSelect;

const albumSortSelect = {
  ...albumCardSelect,
  salesCount: true,
  publishedAt: true,
} satisfies Prisma.AlbumSelect;

/**
 * The card fields plus the primary key.
 *
 * `browseCatalogue` orders and paginates in SQL and then fetches the rows it
 * was given, so it needs the id to put them back in the order the database
 * chose. Nothing downstream sees it — `toCard` builds its result explicitly.
 */
const productCardById = { ...cardSelect, id: true } satisfies Prisma.ProductSelect;
const albumCardById = { ...albumCardSelect, id: true } satisfies Prisma.AlbumSelect;

type ProductSortRow = Prisma.ProductGetPayload<{ select: typeof productSortSelect }>;
type AlbumSortRow = Prisma.AlbumGetPayload<{ select: typeof albumSortSelect }>;

function fromProduct(p: ProductSortRow): Sortable {
  return { kind: "product", ...p };
}

function fromAlbum(a: AlbumSortRow): Sortable {
  const { _count, ...rest } = a;
  return { kind: "album", ...rest, itemCount: _count.items };
}

/** Drops the sort keys once ordering is done. */
function toCard(row: Sortable): CatalogueCard {
  const card: CatalogueCard = {
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    suggestedPriceCents: row.suggestedPriceCents,
    category: row.category,
    vendor: row.vendor,
  };
  if (row.itemCount !== undefined) card.itemCount = row.itemCount;
  return card;
}

type CatalogueSort = "newest" | "popular" | "price-low";

function compare(sort: CatalogueSort) {
  return (a: Sortable, b: Sortable) => {
    if (sort === "popular") return b.salesCount - a.salesCount;
    if (sort === "price-low") return a.suggestedPriceCents - b.suggestedPriceCents;
    const at = a.publishedAt?.getTime() ?? 0;
    const bt = b.publishedAt?.getTime() ?? 0;
    return bt - at;
  };
}

/**
 * Where merging in memory is safe, and where it is not.
 *
 * `getFeaturedCatalogue` and `getLatestCatalogue` below merge in JavaScript and
 * are correct at any catalogue size: the overall top *n* by a single key must
 * lie within the top *n* of each table, so taking *n* from each and re-sorting
 * cannot miss a row.
 *
 * The browse wall is a different problem — it paginates. Reading a bounded
 * slice of each table and sorting it silently drops everything past the bound
 * once the catalogue outgrows it, and the failure is invisible: the page still
 * renders, just without some of the work. That one is done as a SQL union, so
 * ordering and pagination happen where the whole set is.
 */

export async function getFeaturedCatalogue(limit = 24): Promise<CatalogueCard[]> {
  const [products, albums] = await Promise.all([
    db.product.findMany({
      where: { ...LISTING_WHERE, coverImageUrl: { not: null } },
      select: productSortSelect,
      orderBy: [{ salesCount: "desc" }, { viewCount: "desc" }],
      take: limit,
    }),
    db.album.findMany({
      where: { ...ALBUM_PUBLIC_WHERE, coverImageUrl: { not: null } },
      select: albumSortSelect,
      orderBy: [{ salesCount: "desc" }, { viewCount: "desc" }],
      take: limit,
    }),
  ]);

  return [...products.map(fromProduct), ...albums.map(fromAlbum)]
    .sort(compare("popular"))
    .slice(0, limit)
    .map(toCard);
}

export async function getLatestCatalogue(limit = 12): Promise<CatalogueCard[]> {
  const [products, albums] = await Promise.all([
    db.product.findMany({
      where: LISTING_WHERE,
      select: productSortSelect,
      orderBy: { publishedAt: "desc" },
      take: limit,
    }),
    db.album.findMany({
      where: ALBUM_PUBLIC_WHERE,
      select: albumSortSelect,
      orderBy: { publishedAt: "desc" },
      take: limit,
    }),
  ]);

  return [...products.map(fromProduct), ...albums.map(fromAlbum)]
    .sort(compare("newest"))
    .slice(0, limit)
    .map(toCard);
}

/**
 * The browse wall: products and albums in one ordered, paginated list.
 *
 * A UNION in SQL rather than two queries merged in JavaScript. The previous
 * version read up to 500 rows from each table and sorted them here, which was
 * exact for this catalogue and would have quietly started dropping work once
 * it grew — page 11 of a 600-item catalogue would simply have been short, with
 * nothing to indicate why.
 *
 * Raw SQL because Prisma has no union. Every value is parameterised through
 * `Prisma.sql`; the only interpolated *structure* is the ORDER BY, chosen from
 * a fixed set below and never built from user input.
 */
export async function browseCatalogue(filters: BrowseFilters) {
  const perPage = filters.perPage ?? 48;
  const page = Math.max(1, filters.page ?? 1);
  const sort: CatalogueSort = filters.sort ?? "newest";
  const offset = (page - 1) * perPage;

  const q = filters.q?.trim();
  const like = q ? `%${q}%` : null;

  // Enum comparisons are cast on the literal, not on the column: casting the
  // column to text would make `Product_status_publishedAt_idx` unusable.
  const productConditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'PUBLISHED'::"ProductStatus"`,
  ];
  const albumConditions: Prisma.Sql[] = [
    Prisma.sql`a.status = 'PUBLISHED'::"ProductStatus"`,
  ];

  // Searching is the exception to hiding album members: someone typing a track
  // name is looking for that track, not the album it sits in.
  if (!like) {
    productConditions.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "AlbumItem" ai WHERE ai."productId" = p.id)`,
    );
  }

  if (filters.category) {
    productConditions.push(Prisma.sql`p.category = ${filters.category}::"Category"`);
    albumConditions.push(Prisma.sql`a.category = ${filters.category}::"Category"`);
  }

  if (filters.freeOnly) {
    productConditions.push(Prisma.sql`p."suggestedPriceCents" = 0`);
    albumConditions.push(Prisma.sql`a."suggestedPriceCents" = 0`);
  }

  if (like) {
    productConditions.push(Prisma.sql`(
      p.title ILIKE ${like}
      OR p.description ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "TagsOnProducts" tp
        JOIN "Tag" t ON t.id = tp."tagId"
        WHERE tp."productId" = p.id AND t.name ILIKE ${like}
      )
      OR EXISTS (
        SELECT 1 FROM "User" u
        WHERE u.id = p."vendorId" AND (u.name ILIKE ${like} OR u.username ILIKE ${like})
      )
    )`);
    albumConditions.push(Prisma.sql`(
      a.title ILIKE ${like}
      OR a.description ILIKE ${like}
      OR EXISTS (
        SELECT 1 FROM "User" u
        WHERE u.id = a."vendorId" AND (u.name ILIKE ${like} OR u.username ILIKE ${like})
      )
    )`);
  }

  const merged = Prisma.sql`
    SELECT p.id AS id, 'product' AS kind, p."publishedAt" AS published_at,
           p."salesCount" AS sales, p."suggestedPriceCents" AS price
    FROM "Product" p
    WHERE ${Prisma.join(productConditions, " AND ")}
    UNION ALL
    SELECT a.id, 'album', a."publishedAt", a."salesCount", a."suggestedPriceCents"
    FROM "Album" a
    WHERE ${Prisma.join(albumConditions, " AND ")}
  `;

  // Structure, not data — chosen from these three and nothing else. The id is
  // a tiebreaker so paging never repeats or skips a row when two share a key.
  const orderBy =
    sort === "popular"
      ? Prisma.sql`sales DESC, id ASC`
      : sort === "price-low"
        ? Prisma.sql`price ASC, id ASC`
        : Prisma.sql`published_at DESC NULLS LAST, id ASC`;

  const [rows, counted] = await Promise.all([
    db.$queryRaw<{ id: string; kind: string }[]>`
      SELECT id, kind FROM (${merged}) AS catalogue
      ORDER BY ${orderBy}
      LIMIT ${perPage} OFFSET ${offset}
    `,
    db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total FROM (${merged}) AS catalogue
    `,
  ]);

  const productIds = rows.filter((r) => r.kind === "product").map((r) => r.id);
  const albumIds = rows.filter((r) => r.kind === "album").map((r) => r.id);

  const [products, albums] = await Promise.all([
    productIds.length
      ? db.product.findMany({
          where: { id: { in: productIds } },
          select: productCardById,
        })
      : [],
    albumIds.length
      ? db.album.findMany({
          where: { id: { in: albumIds } },
          select: albumCardById,
        })
      : [],
  ]);

  const byId = new Map<string, CatalogueCard>();
  for (const p of products) {
    byId.set(p.id, {
      kind: "product",
      slug: p.slug,
      title: p.title,
      coverImageUrl: p.coverImageUrl,
      suggestedPriceCents: p.suggestedPriceCents,
      category: p.category,
      vendor: p.vendor,
    });
  }
  for (const a of albums) {
    byId.set(a.id, {
      kind: "album",
      slug: a.slug,
      title: a.title,
      coverImageUrl: a.coverImageUrl,
      suggestedPriceCents: a.suggestedPriceCents,
      category: a.category,
      vendor: a.vendor,
      itemCount: a._count.items,
    });
  }

  // Re-ordered to match the union, not the two fetches.
  const items = rows
    .map((r) => byId.get(r.id))
    .filter((card): card is CatalogueCard => card !== undefined);

  const total = Number(counted[0]?.total ?? 0);

  return { items, total, page, perPage, pageCount: Math.ceil(total / perPage) };
}

export async function getAlbumBySlug(slug: string) {
  return db.album.findFirst({
    where: { slug, ...ALBUM_PUBLIC_WHERE },
    include: {
      vendor: {
        select: {
          username: true,
          name: true,
          bio: true,
          avatarUrl: true,
          followerCount: true,
          productCount: true,
          vendorSince: true,
        },
      },
      items: {
        orderBy: { position: "asc" },
        include: {
          product: {
            select: {
              slug: true,
              title: true,
              suggestedPriceCents: true,
              coverImageUrl: true,
              category: true,
              status: true,
              files: true,
            },
          },
        },
      },
    },
  });
}

/**
 * The album a product belongs to, for the "part of" line on its page.
 *
 * Returns null for the overwhelming majority of products, which stand alone.
 */
export async function getAlbumForProduct(productSlug: string) {
  const membership = await db.albumItem.findFirst({
    where: { product: { slug: productSlug }, album: ALBUM_PUBLIC_WHERE },
    select: {
      album: {
        select: {
          slug: true,
          title: true,
          suggestedPriceCents: true,
          coverImageUrl: true,
          _count: { select: { items: true } },
        },
      },
    },
  });
  if (!membership) return null;

  const { _count, ...album } = membership.album;
  return { ...album, itemCount: _count.items };
}

/* ------------------------------------------------------------- homepage ----

   The homepage renders per request now that the header resolves the signed-in
   user on the server, so the five-minute freshness that `export const
   revalidate = 300` used to buy has moved down here onto the queries
   themselves. Same staleness as before, same number of database round trips —
   the difference is that the header is no longer part of what gets cached.
--------------------------------------------------------------------------- */

const HOMEPAGE_REVALIDATE = 300;

/**
 * Tag shared by every homepage cache entry.
 *
 * `revalidatePath("/")` does not touch an `unstable_cache` bucket, so without
 * this a creator who published something watched it not appear on the homepage
 * for up to five minutes and reasonably concluded the upload had failed.
 * Mutations in `src/lib/actions/products.ts` call `revalidateTag(PRODUCTS_TAG)`.
 */
export const PRODUCTS_TAG = "products";

export const getFeaturedProductsCached = unstable_cache(
  (limit: number) => getFeaturedCatalogue(limit),
  ["homepage:featured"],
  { revalidate: HOMEPAGE_REVALIDATE, tags: [PRODUCTS_TAG] },
);

/**
 * The newest work, for the homepage's "Just added" row.
 *
 * `Discover` is ranked by sales, so on a catalogue of this size a brand-new
 * upload cannot appear there for a long time — which reads, to the person who
 * just uploaded it, as the upload having failed. This row is where their work
 * shows up straight away.
 */
export const getLatestProductsCached = unstable_cache(
  (limit: number) => getLatestCatalogue(limit),
  ["homepage:latest"],
  { revalidate: HOMEPAGE_REVALIDATE, tags: [PRODUCTS_TAG] },
);

export const getCategoryCountsCached = unstable_cache(
  () => getCategoryCountEntries(),
  ["homepage:category-counts"],
  { revalidate: HOMEPAGE_REVALIDATE, tags: [PRODUCTS_TAG] },
);

export const getCategoryCoverEntriesCached = unstable_cache(
  () => getCategoryCoverEntries(),
  ["homepage:category-covers"],
  { revalidate: HOMEPAGE_REVALIDATE, tags: [PRODUCTS_TAG] },
);
