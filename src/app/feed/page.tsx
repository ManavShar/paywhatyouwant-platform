import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ProductStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { PostCard } from "@/components/vendor/PostCard";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardSelect } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Following",
  robots: { index: false, follow: false },
};

/**
 * What the creators you follow have been doing.
 *
 * The brief's reason for follows is specific: "so they can download their
 * photography etc as soon as it is released". So new work leads the page and
 * written updates come second — the feed exists to surface releases, not to
 * be a timeline.
 */
export default async function FeedPage() {
  const user = await requireUser();
  if (!user) redirect("/signin?next=/feed");

  const follows = await db.follow.findMany({
    where: { followerId: user.id },
    select: { followedId: true },
  });
  const ids = follows.map((f) => f.followedId);

  if (ids.length === 0) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            You&apos;re not following anyone yet
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Follow a creator and their new work shows up here as soon as they
            release it.
          </p>
          <Link
            href="/browse"
            className="mt-8 inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover"
          >
            Find creators
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  const [products, posts] = await Promise.all([
    db.product.findMany({
      where: { vendorId: { in: ids }, status: ProductStatus.PUBLISHED },
      select: cardSelect,
      orderBy: { publishedAt: "desc" },
      take: 24,
    }),
    db.vendorPost.findMany({
      where: { authorId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        author: { select: { username: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Following
        </h1>
        <p className="mt-1 text-[0.9375rem] text-ink-muted">
          From the {ids.length} {ids.length === 1 ? "creator" : "creators"} you
          follow.
        </p>

        <section className="mt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-subtle">
            New work
          </h2>
          {products.length > 0 ? (
            <ProductGrid products={products} priorityCount={5} />
          ) : (
            <p className="py-10 text-sm text-ink-muted">
              Nothing new from them yet.
            </p>
          )}
        </section>

        {posts.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-subtle">
              Updates
            </h2>
            <div className="max-w-2xl space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
