"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { Category, Licence, ProductStatus, UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { slugify, parsePriceToCents } from "@/lib/utils";
import { PRODUCTS_TAG } from "@/lib/queries";
import { CATEGORY_BY_VALUE } from "@/lib/taxonomy";
import {
  storeUpload,
  removeUpload,
  extensionOf,
  ALLOWED_IMAGE,
  ALLOWED_COVER,
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

const isFile = (v: FormDataEntryValue | null): v is File =>
  v instanceof File && v.size > 0;

/**
 * Every surface a product appears on.
 *
 * Creating used to refresh only the dashboard and `/browse`, so a creator's
 * first instinct — open my own page and look — showed nothing. The homepage
 * was worse: it reads through `unstable_cache`, which `revalidatePath` cannot
 * touch at all, so new work took up to five minutes to appear. Both failure
 * modes look exactly like a broken upload.
 */
function revalidateProduct(opts: {
  username: string;
  category: Category;
  slug?: string;
}) {
  // `updateTag` rather than `revalidateTag`: this runs inside a Server Action
  // and the creator is about to be redirected to a page that must already show
  // their change. Stale-while-revalidate would show them the old catalogue once
  // and look exactly like a failed upload.
  updateTag(PRODUCTS_TAG);
  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath("/feed");
  revalidatePath("/dashboard/products");
  revalidatePath(`/vendor/${opts.username}`);

  const categorySlug = CATEGORY_BY_VALUE.get(opts.category)?.slug;
  if (categorySlug) revalidatePath(`/category/${categorySlug}`);
  if (opts.slug) revalidatePath(`/product/${opts.slug}`);
}

/**
 * Recomputes the denormalised `productCount` from the live rows.
 *
 * It used to be incremented on publish and decremented nowhere, so unpublishing
 * or deleting left it permanently too high — and the public vendor page renders
 * that number directly above a grid that counts the real rows, which is a
 * disagreement a creator can see. Counting is trivial at this scale and cannot
 * drift.
 */
async function syncProductCount(vendorId: string) {
  const productCount = await db.product.count({
    where: { vendorId, status: ProductStatus.PUBLISHED },
  });
  await db.user.update({ where: { id: vendorId }, data: { productCount } });
}

/** Shared field parsing for create and edit. Returns an error string or the values. */
function parseFields(formData: FormData) {
  const parsed = schema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: formData.get("category"),
    licence: formData.get("licence"),
    tags: String(formData.get("tags") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" } as const;
  }

  // A price of 0 is valid and meaningful here — it means "take it, pay if you
  // like". So parse and check for null, never for falsiness.
  const suggested = parsePriceToCents(String(formData.get("suggestedPrice") ?? "0"));
  if (suggested === null) {
    return { error: "That suggested price isn't a number" } as const;
  }

  const minimum = parsePriceToCents(String(formData.get("minimumPrice") ?? "0")) ?? 0;
  if (minimum > suggested && suggested > 0) {
    return { error: "The minimum can't be more than the suggested price" } as const;
  }

  return { values: { ...parsed.data, suggested, minimum } } as const;
}

/** Type and size checks for whichever of the three files were supplied. */
function validateFiles(formData: FormData): string | null {
  const checks = [
    [formData.get("productFile"), ALLOWED_PRODUCT, "product file"],
    [formData.get("coverImage"), ALLOWED_COVER, "cover image"],
    [
      formData.get("previewFile"),
      new Set([...ALLOWED_AUDIO, ...ALLOWED_IMAGE]),
      "preview",
    ],
  ] as const;

  for (const [file, allowed, label] of checks) {
    if (!isFile(file)) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      return `That ${label} is over the 48 MB limit.`;
    }
    if (!allowed.has(extensionOf(file.name))) {
      // Name the formats that work. The old wording was both unhelpful and
      // ungrammatical — with `label` of "product file" it read "we can't
      // accept that product file file type".
      if (label === "cover image") {
        return "A cover image has to be a JPEG, PNG or GIF.";
      }
      if (label === "preview") {
        return "A preview has to be an audio file or an image (MP3, WAV, JPEG, PNG).";
      }
      return `We can't accept a .${extensionOf(file.name)} file. Images, audio, PDF, ePub, video and ZIP all work.`;
    }
  }
  return null;
}

/** Replaces a product's tags with the comma-separated list from the form. */
async function syncTags(productId: string, tags: string | undefined) {
  const tagNames = [
    ...new Set(
      (tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  ];

  await db.tagsOnProducts.deleteMany({ where: { productId } });

  for (const name of tagNames) {
    const tagSlug = slugify(name);
    if (!tagSlug) continue;
    const tag = await db.tag.upsert({
      where: { slug: tagSlug },
      update: {},
      create: { slug: tagSlug, name },
    });
    await db.tagsOnProducts.create({ data: { productId, tagId: tag.id } });
  }
}

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
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to upload." };
  }

  const fields = parseFields(formData);
  if ("error" in fields) return { error: fields.error };
  const { title, description, category, licence, tags, suggested, minimum } =
    fields.values;

  const productFile = formData.get("productFile");
  const coverFile = formData.get("coverImage");
  const previewFile = formData.get("previewFile");

  if (!isFile(productFile) && !isFile(previewFile)) {
    return {
      error:
        "Upload the file people are buying, or at least a preview they can stream.",
    };
  }

  // Validate everything before writing anything.
  const fileError = validateFiles(formData);
  if (fileError) return { error: fileError };

  const asDraft = formData.get("intent") === "draft";
  const written: string[] = [];
  let slug: string;

  try {
    // Paid asset stays private — the only route to it is a signed grant.
    const stored = isFile(productFile)
      ? await storeUpload(productFile, "private")
      : null;
    if (stored) written.push(stored.storageKey);

    // Cover and preview are public by design: browsing and the embeddable
    // widget both need them without an account.
    const cover = isFile(coverFile)
      ? await storeUpload(coverFile, "public", { as: "cover" })
      : null;
    if (cover) written.push(cover.storageKey);

    // An image preview is published as a rendition too. A "preview" that is
    // the full original is the giveaway this whole rule exists to stop, and
    // for a photograph the preview is not even displayed — the product page
    // only renders one for audio.
    const preview = isFile(previewFile)
      ? await storeUpload(previewFile, "public", {
          ...(ALLOWED_IMAGE.has(extensionOf(previewFile.name))
            ? { as: "cover" as const }
            : {}),
        })
      : null;
    if (preview) written.push(preview.storageKey);

    const baseSlug = slugify(title) || "product";
    slug = `${baseSlug}-${Date.now().toString(36)}`;

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

    await syncTags(product.id, tags);
    await syncProductCount(user.id);
  } catch (err) {
    // Don't leave half an upload on disk behind a failed row.
    await Promise.all(written.map((k) => removeUpload(k)));
    console.error("createProduct failed", err);
    return { error: "Something went wrong saving that. Please try again." };
  }

  revalidateProduct({ username: user.username, category, slug });
  // The banner on the other side says either "it's live" or "saved as a
  // draft". It used to claim both were live, which is untrue at exactly the
  // moment someone is checking whether their draft saved.
  redirect(`/dashboard/products?created=${asDraft ? "draft" : "live"}`);
}

/**
 * Edits an existing product.
 *
 * File fields are optional here and mean "replace": leaving one empty keeps
 * what is already attached. The superseded file is only deleted from disk once
 * the database is consistent, so a failure part-way through cannot destroy the
 * original.
 */
export async function updateProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const productId = String(formData.get("productId") ?? "");
  const existing = await db.product.findUnique({
    where: { id: productId },
    include: { files: true },
  });

  // Ownership is re-checked here rather than inferred from the page that
  // rendered the form — a Server Action is a public POST endpoint.
  if (!existing || existing.vendorId !== user.id) {
    return { error: "That product isn't yours to edit." };
  }

  const fields = parseFields(formData);
  if ("error" in fields) return { error: fields.error };
  const { title, description, category, licence, tags, suggested, minimum } =
    fields.values;

  const fileError = validateFiles(formData);
  if (fileError) return { error: fileError };

  const productFile = formData.get("productFile");
  const coverFile = formData.get("coverImage");
  const previewFile = formData.get("previewFile");

  const written: string[] = [];
  const supersededKeys: string[] = [];

  try {
    const stored = isFile(productFile)
      ? await storeUpload(productFile, "private")
      : null;
    if (stored) written.push(stored.storageKey);

    const cover = isFile(coverFile)
      ? await storeUpload(coverFile, "public", { as: "cover" })
      : null;
    if (cover) written.push(cover.storageKey);

    // An image preview is published as a rendition too. A "preview" that is
    // the full original is the giveaway this whole rule exists to stop, and
    // for a photograph the preview is not even displayed — the product page
    // only renders one for audio.
    const preview = isFile(previewFile)
      ? await storeUpload(previewFile, "public", {
          ...(ALLOWED_IMAGE.has(extensionOf(previewFile.name))
            ? { as: "cover" as const }
            : {}),
        })
      : null;
    if (preview) written.push(preview.storageKey);

    await db.product.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        category,
        licence,
        suggestedPriceCents: suggested,
        minimumPriceCents: minimum,
        ...(cover ? { coverImageUrl: cover.publicUrl } : {}),
      },
    });

    // The paid file and the preview are replaced independently.
    for (const [replacement, isPreview] of [
      [stored, false],
      [preview, true],
    ] as const) {
      if (!replacement) continue;

      const old = existing.files.filter((f) => f.isPreview === isPreview);
      await db.productFile.create({
        data: {
          productId: existing.id,
          isPreview,
          fileName: replacement.fileName,
          storageKey: replacement.storageKey,
          extension: replacement.extension,
          mimeType: replacement.mimeType,
          sizeBytes: replacement.sizeBytes,
          downloadedAt: new Date(),
        },
      });
      await db.productFile.deleteMany({
        where: { id: { in: old.map((f) => f.id) } },
      });
      supersededKeys.push(...old.map((f) => f.storageKey));
    }

    await syncTags(existing.id, tags);
  } catch (err) {
    await Promise.all(written.map((k) => removeUpload(k)));
    console.error("updateProduct failed", err);
    return { error: "Something went wrong saving that. Please try again." };
  }

  // Only once the database no longer refers to them.
  await Promise.all(supersededKeys.map((k) => removeUpload(k)));

  revalidateProduct({ username: user.username, category, slug: existing.slug });
  if (category !== existing.category) {
    revalidateProduct({ username: user.username, category: existing.category });
  }
  redirect("/dashboard/products?updated=1");
}

export type ProductActionState = { error?: string } | undefined;

/**
 * Publishes a draft, or takes a live product down.
 *
 * `publishedAt` is set the first time only. It is the date shown publicly and
 * the key "newest" sorts on, so bringing something back after a week offline
 * must not make it look brand new.
 */
export async function setProductStatus(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const productId = String(formData.get("productId") ?? "");
  const publish = formData.get("status") === "publish";

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product || product.vendorId !== user.id) {
    return { error: "That product isn't yours." };
  }

  // FLAGGED means an import held it back for review. A vendor toggling their
  // own listing must not be able to clear that themselves.
  if (product.status === ProductStatus.FLAGGED) {
    return { error: "This one is held for review and can't be published yet." };
  }

  await db.product.update({
    where: { id: product.id },
    data: {
      status: publish ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
      ...(publish && !product.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  await syncProductCount(user.id);
  revalidateProduct({
    username: user.username,
    category: product.category,
    slug: product.slug,
  });
  return undefined;
}

/**
 * Deletes a product and the files behind it.
 *
 * `OrderItem.product` is `onDelete: Restrict`, so anything that has ever sold
 * cannot be removed — deliberately, because an order line pointing at nothing
 * would destroy a buyer's record of what they bought and the vendor's record
 * of what they earned. That case is caught and explained rather than being
 * allowed to surface as a database error.
 */
export async function deleteProduct(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const productId = String(formData.get("productId") ?? "");
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { files: true, _count: { select: { orderItems: true } } },
  });
  if (!product || product.vendorId !== user.id) {
    return { error: "That product isn't yours." };
  }

  if (product._count.orderItems > 0) {
    return {
      error:
        "Someone has bought this, so it can't be deleted — their record of the purchase points at it. Unpublish it instead and it disappears from the site.",
    };
  }

  const keys = product.files.map((f) => f.storageKey);

  try {
    await db.product.delete({ where: { id: product.id } });
  } catch (err) {
    console.error("deleteProduct failed", err);
    return { error: "Something went wrong deleting that. Please try again." };
  }

  // Files go last: a row pointing at a missing file is worse than a stray file
  // with no row.
  await Promise.all(keys.map((k) => removeUpload(k)));

  await syncProductCount(user.id);
  revalidateProduct({
    username: user.username,
    category: product.category,
    slug: product.slug,
  });
  return undefined;
}
