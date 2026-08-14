"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { storeUpload, extensionOf, ALLOWED_IMAGE, MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Follows and vendor posts.
 *
 * The brief asks for both: "people should be able to follow their favourite
 * vendors so they can download their photography etc as soon as it is
 * released", and "vendors should be able to do posts like social media,
 * talking about their upcoming work".
 */

export type FollowResult = { following: boolean; error?: string };

/**
 * Toggle following a creator.
 *
 * The Follow row and the denormalised counter must move together — a counter
 * that drifts from the rows is worse than no counter, because it is believed.
 * Both writes go in one transaction, and the toggle is derived from what is
 * actually in the table rather than from what the client claims.
 */
export async function toggleFollow(username: string): Promise<FollowResult> {
  const me = await currentUser();
  if (!me) return { following: false, error: "Sign in to follow creators." };

  const target = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) return { following: false, error: "That creator doesn't exist." };
  if (target.id === me.id) {
    return { following: false, error: "You can't follow yourself." };
  }

  const existing = await db.follow.findUnique({
    where: {
      followerId_followedId: { followerId: me.id, followedId: target.id },
    },
  });

  if (existing) {
    await db.$transaction([
      db.follow.delete({
        where: {
          followerId_followedId: { followerId: me.id, followedId: target.id },
        },
      }),
      db.user.update({
        where: { id: target.id },
        data: { followerCount: { decrement: 1 } },
      }),
      db.user.update({
        where: { id: me.id },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);
    revalidatePath(`/vendor/${username}`);
    return { following: false };
  }

  await db.$transaction([
    db.follow.create({
      data: { followerId: me.id, followedId: target.id },
    }),
    db.user.update({
      where: { id: target.id },
      data: { followerCount: { increment: 1 } },
    }),
    db.user.update({
      where: { id: me.id },
      data: { followingCount: { increment: 1 } },
    }),
  ]);
  revalidatePath(`/vendor/${username}`);
  return { following: true };
}

export async function isFollowing(username: string): Promise<boolean> {
  const me = await currentUser();
  if (!me) return false;
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) return false;
  const row = await db.follow.findUnique({
    where: {
      followerId_followedId: { followerId: me.id, followedId: target.id },
    },
  });
  return row !== null;
}

// ---------------------------------------------------------------- posts ----

/**
 * `token` changes on every successful post. The composer uses it as a React
 * key to remount its fields, which clears them without an effect that calls
 * setState — see PostComposer.
 */
export type PostState =
  | { error?: string; ok?: boolean; token?: number }
  | undefined;

const postSchema = z.object({
  body: z
    .string()
    .min(1, "Write something first")
    .max(2000, "Keep it under 2000 characters"),
});

export async function createPost(
  _prev: PostState,
  formData: FormData,
): Promise<PostState> {
  const me = await currentUser();
  if (!me || me.role === UserRole.BUYER) {
    return { error: "You need a creator account to post." };
  }

  const parsed = postSchema.safeParse({
    body: String(formData.get("body") ?? "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your post" };
  }

  const image = formData.get("image");
  let imageUrl: string | null = null;

  if (image instanceof File && image.size > 0) {
    if (image.size > MAX_UPLOAD_BYTES) return { error: "That image is too large." };
    if (!ALLOWED_IMAGE.has(extensionOf(image.name))) {
      return { error: "Posts can only carry an image file." };
    }
    const stored = await storeUpload(image, "public");
    imageUrl = stored.publicUrl;
  }

  await db.vendorPost.create({
    data: { authorId: me.id, body: parsed.data.body, imageUrl },
  });

  revalidatePath("/dashboard/posts");
  revalidatePath(`/vendor/${me.username}`);
  revalidatePath("/feed");
  return { ok: true, token: Date.now() };
}

export async function deletePost(postId: string) {
  const me = await currentUser();
  if (!me) return;

  // Scope the delete to the author rather than checking ownership first and
  // deleting second — that gap is where someone else's post gets removed.
  await db.vendorPost.deleteMany({ where: { id: postId, authorId: me.id } });

  revalidatePath("/dashboard/posts");
  revalidatePath(`/vendor/${me.username}`);
  revalidatePath("/feed");
}
