"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { storeUpload, extensionOf, ALLOWED_IMAGE, MAX_UPLOAD_BYTES } from "@/lib/storage";

export type ProfileState = { error?: string; ok?: boolean } | undefined;

const schema = z.object({
  name: z.string().max(60).optional(),
  bio: z.string().max(600, "Keep the bio under 600 characters").optional(),
  website: z.string().url("That website isn't a valid URL").or(z.literal("")).optional(),
  twitter: z.string().max(40).optional(),
  instagram: z.string().max(40).optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  if (!user) return { error: "You need to be signed in." };

  const parsed = schema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    bio: String(formData.get("bio") ?? "").trim(),
    website: String(formData.get("website") ?? "").trim(),
    twitter: String(formData.get("twitter") ?? "").trim().replace(/^@/, ""),
    instagram: String(formData.get("instagram") ?? "").trim().replace(/^@/, ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const avatar = formData.get("avatar");
  let avatarUrl: string | undefined;

  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_UPLOAD_BYTES) return { error: "That image is too large." };
    if (!ALLOWED_IMAGE.has(extensionOf(avatar.name))) {
      return { error: "Avatars need to be an image file." };
    }
    const stored = await storeUpload(avatar, "public");
    avatarUrl = stored.publicUrl ?? undefined;
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name || null,
      bio: parsed.data.bio || null,
      website: parsed.data.website || null,
      twitter: parsed.data.twitter || null,
      instagram: parsed.data.instagram || null,
      ...(avatarUrl ? { avatarUrl } : {}),
    },
  });

  revalidatePath("/dashboard/profile");
  revalidatePath(`/vendor/${user.username}`);
  return { ok: true };
}
