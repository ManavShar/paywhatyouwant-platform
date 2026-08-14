"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Category, Licence, ProductStatus, UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { slugify, parsePriceToCents } from "@/lib/utils";
import {
  storeUpload,
  removeUpload,
  extensionOf,
  ALLOWED_IMAGE,
  ALLOWED_PRODUCT,
  ALLOWED_AUDIO,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const schema = z.object({
  title: z.string().min(1, "Give it a name").max(50, "Keep it under 50 characters"),
  description: z.string().min(1, "Write a description — it's what search uses"),
  category: z.nativeEnum(Category),
  licence: z.nativeEnum(Licence),
  tags: z.string().optional(),
});

/**
 * Creates a product from the upload form.
 *
 * Ordering matters: files are written to disk first, then the database row is
 * created in one go. If the row fails, the uploaded files are removed so a
 * failed submission cannot leave orphans filling the disk.
 */
export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await currentUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to upload." };
  }

  const parsed = schema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: formData.get("category"),
    licence: formData.get("licence"),
    tags: String(formData.get("tags") ?? ""),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Check the form" };
  }
  const { title, description, category, licence, tags } = parsed.data;

  // A price of 0 is valid and meaningful here — it means "take it, pay if you
  // like". So parse and check for null, never for falsiness.
  const suggested = parsePriceToCents(String(formData.get("suggestedPrice") ?? "0"));
  if (suggested === null) return { error: "That suggested price isn't a number" };

  const minimum = parsePriceToCents(String(formData.get("minimumPrice") ?? "0")) ?? 0;
  if (minimum > suggested && suggested > 0) {
    return { error: "The minimum can't be more than the suggested price" };
  }

  const productFile = formData.get("productFile");
  const coverFile = formData.get("coverImage");
  const previewFile = formData.get("previewFile");

  const isFile = (v: FormDataEntryValue | null): v is File =>
    v instanceof File && v.size > 0;

  if (!isFile(productFile) && !isFile(previewFile)) {
    return {
      error:
        "Upload the file people are buying, or at least a preview they can stream.",
    };
  }

  // Validate everything before writing anything.
  for (const [file, allowed, label] of [
    [productFile, ALLOWED_PRODUCT, "product file"],
    [coverFile, ALLOWED_IMAGE, "cover image"],
    [previewFile, new Set([...ALLOWED_AUDIO, ...ALLOWED_IMAGE]), "preview"],
  ] as const) {
    if (!isFile(file)) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: `That ${label} is over the 500 MB limit.` };
    }
    if (!allowed.has(extensionOf(file.name))) {
      return { error: `We can't accept that ${label} file type.` };
    }
  }

  const written: string[] = [];
  try {
    // Paid asset stays private — the only route to it is a signed grant.
    const stored = isFile(productFile)
      ? await storeUpload(productFile, "private")
      : null;
    if (stored) written.push(stored.storageKey);

    // Cover and preview are public by design: browsing and the embeddable
    // widget both need them without an account.
    const cover = isFile(coverFile) ? await storeUpload(coverFile, "public") : null;
    if (cover) written.push(cover.storageKey);

    const preview = isFile(previewFile)
      ? await storeUpload(previewFile, "public")
      : null;
    if (preview) written.push(preview.storageKey);

    const baseSlug = slugify(title) || "product";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const asDraft = formData.get("intent") === "draft";

    const product = await db.product.create({
      data: {
        slug,
        title,
        description,
        category,
        licence,
        status: asDraft ? ProductStatus.DRAFT : ProductStatus.PUBLISHED,
        suggestedPriceCents: suggested,
        minimumPriceCents: minimum,
        coverImageUrl: cover?.publicUrl ?? null,
        vendorId: user.id,
        publishedAt: asDraft ? null : new Date(),
        files: {
          create: [
            ...(stored
              ? [
                  {
                    isPreview: false,
                    fileName: stored.fileName,
                    storageKey: stored.storageKey,
                    extension: stored.extension,
                    mimeType: stored.mimeType,
                    sizeBytes: stored.sizeBytes,
                    downloadedAt: new Date(),
                  },
                ]
              : []),
            ...(preview
              ? [
                  {
                    isPreview: true,
                    fileName: preview.fileName,
                    storageKey: preview.storageKey,
                    extension: preview.extension,
                    mimeType: preview.mimeType,
                    sizeBytes: preview.sizeBytes,
                    downloadedAt: new Date(),
                  },
                ]
              : []),
          ],
        },
      },
    });

    // Tags: comma separated, deduped, empties dropped.
    const tagNames = [
      ...new Set(
        (tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
    for (const name of tagNames) {
      const tagSlug = slugify(name);
      if (!tagSlug) continue;
      const tag = await db.tag.upsert({
        where: { slug: tagSlug },
        update: {},
        create: { slug: tagSlug, name },
      });
      await db.tagsOnProducts.create({
        data: { productId: product.id, tagId: tag.id },
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { productCount: { increment: asDraft ? 0 : 1 } },
    });
  } catch (err) {
    // Don't leave half an upload on disk behind a failed row.
    await Promise.all(written.map((k) => removeUpload(k)));
    console.error("createProduct failed", err);
    return { error: "Something went wrong saving that. Please try again." };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/browse");
  redirect("/dashboard/products?created=1");
}
