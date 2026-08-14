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
    where: { ...PUBLIC_WHERE, coverImageUrl: { not: null } },
    select: cardSelect,
    orderBy: [{ salesCount: "desc" }, { viewCount: "desc" }],
    take: limit,
  });
}

export async function getLatestProducts(limit = 12, category?: Category) {
  return db.product.findMany({
    where: { ...PUBLIC_WHERE, ...(category ? { category } : {}) },
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

  const where: Prisma.ProductWhereInput = { ...PUBLIC_WHERE };

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
    where: { ...PUBLIC_WHERE, category, slug: { not: productSlug } },
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
        where: PUBLIC_WHERE,
        select: { coverImageUrl: true, slug: true },
        orderBy: { salesCount: "desc" },
        take: 3,
      },
    },
    orderBy: [{ productCount: "desc" }, { totalSales: "desc" }],
    take: limit,
  });
}

export async function getCategoryCounts() {
  const rows = await db.product.groupBy({
    by: ["category"],
    where: PUBLIC_WHERE,
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.category, r._count._all]));
}

/** One representative cover per category, for the browse tiles. */
export async function getCategoryCovers() {
  const covers = new Map<Category, string>();
  for (const category of Object.values(Category)) {
    const p = await db.product.findFirst({
      where: { ...PUBLIC_WHERE, category, coverImageUrl: { not: null } },
      select: { coverImageUrl: true },
      orderBy: { salesCount: "desc" },
    });
    if (p?.coverImageUrl) covers.set(category, p.coverImageUrl);
  }
  return covers;
}
