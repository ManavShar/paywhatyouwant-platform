import type { MetadataRoute } from "next";
import { ProductStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/taxonomy";

/**
 * Every page worth indexing, built from the catalogue rather than a list
 * somebody has to remember to update.
 *
 * There was no sitemap, so nothing here was discoverable except by a crawler
 * walking links from the homepage — which finds the newest work and gives up
 * long before the back catalogue. Products, albums and creator pages are the
 * whole point of the site and are exactly what a search engine will not reach
 * on its own.
 *
 * `lastModified` comes from the row's own `updatedAt` where there is one. A
 * sitemap that claims everything changed today teaches crawlers to ignore the
 * field, which is worse than omitting it.
 *
 * Sizing: the format caps at 50,000 URLs per file. This catalogue is in the
 * low hundreds, so one file is right; past a few thousand it wants splitting
 * into a sitemap index.
 *
 * Built per request, for the same reason as `robots.ts`: a sitemap generated
 * during a password-gated build is an empty one, and it would stay empty until
 * something happened to rebuild it. Crawlers fetch this rarely and the three
 * queries behind it are all indexed.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // A private preview should not be advertising a map of itself.
  if (process.env.PREVIEW_PASSWORD) return [];

  const [products, albums, vendors] = await Promise.all([
    db.product.findMany({
      where: { status: ProductStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    db.album.findMany({
      where: { status: ProductStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    db.user.findMany({
      where: { productCount: { gt: 0 } },
      select: { username: true, updatedAt: true },
    }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/sell`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/research`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: `${siteUrl}/category/${category.slug}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // Albums rank above their own members: a collection is the thing the site
  // wants people to land on, and its tracks are hidden from listings for the
  // same reason.
  const albumPages: MetadataRoute.Sitemap = albums.map((album) => ({
    url: `${siteUrl}/album/${album.slug}`,
    lastModified: album.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/product/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const vendorPages: MetadataRoute.Sitemap = vendors.map((vendor) => ({
    url: `${siteUrl}/vendor/${vendor.username}`,
    lastModified: vendor.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...categoryPages,
    ...albumPages,
    ...productPages,
    ...vendorPages,
  ];
}
