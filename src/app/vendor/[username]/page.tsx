import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductStatus } from "@prisma/client";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProductGrid } from "@/components/product/ProductGrid";
import { db } from "@/lib/db";
import { isFollowing } from "@/lib/actions/social";
import { FollowButton } from "@/components/vendor/FollowButton";
import { PostCard } from "@/components/vendor/PostCard";
import { cardSelect } from "@/lib/queries";


async function getVendor(username: string) {
  return db.user.findUnique({
    where: { username },
    select: {
      username: true,
      name: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      followerCount: true,
      productCount: true,
      totalSales: true,
      vendorSince: true,
      products: {
        where: { status: ProductStatus.PUBLISHED },
        select: cardSelect,
        orderBy: { publishedAt: "desc" },
      },
      posts: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function generateMetadata(
  props: PageProps<"/vendor/[username]">,
): Promise<Metadata> {
  const { username } = await props.params;
  const vendor = await getVendor(username);
  if (!vendor) return { title: "Not found" };
  const name = vendor.name || vendor.username;
  return {
    title: name,
    description: vendor.bio ?? `Work by ${name} on Paywhatyouwant.io.`,
  };
}

/**
 * A creator's page doubles as their portfolio, so it leads with the work
 * rather than with statistics. The old site put a six-figure stat block above
 * the products; here the numbers are small, factual, and secondary.
 */
export default async function VendorPage(
  props: PageProps<"/vendor/[username]">,
) {
  const { username } = await props.params;
  const vendor = await getVendor(username);
  if (!vendor) notFound();

  const following = await isFollowing(username);
  const name = vendor.name || vendor.username;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface sm:h-24 sm:w-24">
            {vendor.avatarUrl ? (
              <Image
                src={vendor.avatarUrl}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-2xl font-extrabold text-ink-subtle">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {name}
            </h1>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span>
                <strong className="font-semibold text-ink">
                  {vendor.productCount}
                </strong>{" "}
                {vendor.productCount === 1 ? "item" : "items"}
              </span>
              {vendor.vendorSince && (
                <span>
                  Joined{" "}
                  {vendor.vendorSince.toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>

            {vendor.bio && (
              <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
                {vendor.bio}
              </p>
            )}
          </div>

          <FollowButton
            username={vendor.username}
            initialFollowing={following}
            initialCount={vendor.followerCount}
          />
        </header>

        {vendor.posts.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-subtle">
              Updates
            </h2>
            <div className="max-w-2xl space-y-3">
              {vendor.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          {vendor.products.length > 0 ? (
            <ProductGrid products={vendor.products} priorityCount={5} />
          ) : (
            <p className="py-20 text-center text-ink-muted">
              {name} hasn&apos;t published anything yet.
            </p>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
