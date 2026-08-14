import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PostComposer } from "@/components/vendor/PostComposer";
import { PostCard } from "@/components/vendor/PostCard";
import { deletePost } from "@/lib/actions/social";
import { formatCount } from "@/lib/utils";

export const metadata: Metadata = { title: "Updates" };

export default async function VendorPostsPage() {
  const user = await requireVendor();

  const [posts, me] = await Promise.all([
    db.vendorPost.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { followerCount: true },
    }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Updates</h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          Tell people what you&apos;re working on. This goes to your{" "}
          {formatCount(me.followerCount)}{" "}
          {me.followerCount === 1 ? "follower" : "followers"} and sits on your
          public page.
        </p>
      </header>

      <div className="max-w-2xl">
        <PostComposer />

        {posts.length > 0 ? (
          <div className="mt-6 space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                action={
                  <form
                    action={async () => {
                      "use server";
                      await deletePost(post.id);
                    }}
                    className="ml-auto"
                  >
                    <button
                      type="submit"
                      aria-label="Delete this update"
                      className="grid h-8 w-8 place-items-center rounded-control text-ink-subtle transition-colors hover:bg-surface-hover hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                }
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-center text-sm text-ink-muted">
            Nothing posted yet.
          </p>
        )}
      </div>
    </div>
  );
}
