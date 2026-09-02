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
import { removeUpload } from "@/lib/storage";
import { verifyUploadKey } from "@/lib/upload-token";

/**
 * Albums.
 *
 * The client asked for both halves: the full collection as the primary,
 * best-value item, and individual tracks or photographs still buyable on their
 * own — with pay what you want applying to both rather than fixed prices.
 *
 * That is why an album groups products instead of holding files. Each member
 * is an ordinary `Product`, so "buy one track" is an ordinary purchase that
 * needed no new code at all, and every member gets a page, a licence and an
 * embed for free. The album is the second thing to buy, and buying it creates
 * one order with one item per member — a shape the checkout and the Stripe
 * webhook already understood.
 */

export type AlbumFormState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

const fieldsSchema = z.object({
  title: z
    .string()
    .min(1, "Give the album a name")
    .max(80, "Keep it under 80 characters"),
  description: z.string().min(1, "Write a description — it's what search uses"),
  category: z.nativeEnum(Category),
  licence: z.nativeEnum(Licence),
});

/**
 * One uploaded file, as the builder reports it back.
 *
 * `token` is the signature `/api/upload` issued. Without verifying it, this
 * action would accept any storage key the browser cared to name, including the
 * key of somebody else's paid file.
 */
const uploadSchema = z.object({
  storageKey: z.string().min(1),
  token: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  extension: z.string().nullish(),
  mimeType: z.string().nullish(),
  publicUrl: z.string().nullish(),
});

const trackSchema = uploadSchema.extend({
  title: z.string().min(1, "Every item needs a title").max(120),
  /** As the user typed it; parsed to cents below. */
  price: z.string().optional(),
});

const payloadSchema = z.object({
  tracks: z.array(trackSchema).min(1, "Add at least one item to the album"),
  cover: uploadSchema.nullish(),
});

function revalidateAlbum(opts: {
  username: string;
  category: Category;
  slug?: string;
  productSlugs?: string[];
}) {
  updateTag(PRODUCTS_TAG);
  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath("/feed");
  revalidatePath("/dashboard/albums");
  revalidatePath("/dashboard/products");
  revalidatePath(`/vendor/${opts.username}`);

  const categorySlug = CATEGORY_BY_VALUE.get(opts.category)?.slug;
  if (categorySlug) revalidatePath(`/category/${categorySlug}`);
  if (opts.slug) revalidatePath(`/album/${opts.slug}`);

  // A member's own page states which album it belongs to, so it goes stale
  // when the album changes.
  for (const slug of opts.productSlugs ?? []) revalidatePath(`/product/${slug}`);
}

/** Recomputes the creator's published-item count from live rows. */
async function syncProductCount(vendorId: string) {
  const productCount = await db.product.count({
    where: { vendorId, status: ProductStatus.PUBLISHED },
  });
  await db.user.update({ where: { id: vendorId }, data: { productCount } });
}

function parseAlbumFields(formData: FormData) {
  const parsed = fieldsSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: formData.get("category"),
    licence: formData.get("licence"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" } as const;
  }

  // Zero is a real price here, so check for null rather than falsiness.
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

function parsePayload(formData: FormData) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "The upload didn't come through. Please try again." } as const;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the uploads" } as const;
  }
  return { values: parsed.data } as const;
}

/** Rejects any file whose signature does not match this user and visibility. */
function checkOwnership(
  userId: string,
  files: { storageKey: string; token: string }[],
  visibility: "public" | "private",
): string | null {
  for (const f of files) {
    if (!verifyUploadKey(f.token, { userId, storageKey: f.storageKey, visibility })) {
      return "One of those files didn't come from this upload. Please try again.";
    }
  }
  return null;
}

/**
 * What one item costs on its own when the creator does not say.
 *
 * Deliberately not `album / count`: an even division makes buying everything
 * separately cost exactly the same as the album, and the client asked for the
 * collection to be the best-value option — a bundle that saves nothing is not
 * one. The parts are priced so they come to roughly a quarter more than the
 * whole, then rounded up to the nearest 25c so the numbers read like prices
 * rather than arithmetic.
 *
 * It is only ever a default. The creator types over it per item in the
 * builder, and the album page states the resulting saving as a fact rather
 * than claiming one — if a creator prices the parts cheaper than the album,
 * nothing is claimed at all.
 */
const BUNDLE_MARKUP = 1.25;

/**
 * The floor each member inherits from its album.
 *
 * Without this the album's minimum was trivially bypassable: members were
 * created with a floor of 0, so a creator who set a $10 minimum on the
 * collection still had every track buyable at nothing, and a buyer taking all
 * of them one at a time got the whole album free. Rounding up means the parts
 * can never total less than the album's floor.
 *
 * Only ever raised, never lowered, when an album is edited — a creator who
 * deliberately set a higher floor on one item keeps it.
 */
function memberFloor(albumMinimumCents: number, count: number): number {
  if (albumMinimumCents <= 0 || count === 0) return 0;
  return Math.ceil(albumMinimumCents / count);
}

function defaultTrackPrice(albumCents: number, count: number): number {
  if (albumCents === 0 || count === 0) return 0;
  const perItem = (albumCents * BUNDLE_MARKUP) / count;
  return Math.max(25, Math.ceil(perItem / 25) * 25);
}

/**
 * Creates an album and a product for each of its members.
 *
 * The files are already on disk — the builder streamed them to `/api/upload`
 * one at a time, which is the only way a collection larger than the Server
 * Action body limit can be uploaded at all. What arrives here is the list of
 * keys plus the titles and prices the creator typed.
 */
export async function createAlbum(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to publish an album." };
  }

  const fields = parseAlbumFields(formData);
  if ("error" in fields) return { error: fields.error };
  const { title, description, category, licence, suggested, minimum } = fields.values;

  const payload = parsePayload(formData);
  if ("error" in payload) return { error: payload.error };
  const { tracks, cover } = payload.values;

  const ownershipError =
    checkOwnership(user.id, tracks, "private") ??
    (cover ? checkOwnership(user.id, [cover], "public") : null);
  if (ownershipError) return { error: ownershipError };

  const asDraft = formData.get("intent") === "draft";
  const status = asDraft ? ProductStatus.DRAFT : ProductStatus.PUBLISHED;
  const publishedAt = asDraft ? null : new Date();

  const stamp = Date.now().toString(36);
  const albumSlug = `${slugify(title) || "album"}-${stamp}`;
  const productSlugs: string[] = [];

  try {
    await db.$transaction(async (tx) => {
      const album = await tx.album.create({
        data: {
          slug: albumSlug,
          title,
          description,
          category,
          licence,
          status,
          suggestedPriceCents: suggested,
          minimumPriceCents: minimum,
          coverImageUrl: cover?.publicUrl ?? null,
          vendorId: user.id,
          publishedAt,
        },
      });

      for (const [index, track] of tracks.entries()) {
        // Each member is a full product: its own page, its own price, its own
        // licence. That is what makes "buy just this one" work with no special
        // handling anywhere downstream.
        const floor = memberFloor(minimum, tracks.length);
        const typed = parsePriceToCents(track.price ?? "");
        // A suggestion below the floor would render a price control whose
        // pre-filled value the server then rejects.
        const trackPrice = Math.max(
          floor,
          typed ?? defaultTrackPrice(suggested, tracks.length),
        );

        const product = await tx.product.create({
          data: {
            slug: `${slugify(track.title) || "track"}-${stamp}-${index + 1}`,
            title: track.title,
            description,
            category,
            licence,
            status,
            suggestedPriceCents: trackPrice,
            // Members inherit a share of the album's floor. See `memberFloor`
            // — a floor that only applied to the bundle was no floor at all.
            minimumPriceCents: floor,
            coverImageUrl: cover?.publicUrl ?? null,
            vendorId: user.id,
            publishedAt,
            files: {
              create: [
                {
                  isPreview: false,
                  fileName: track.fileName,
                  storageKey: track.storageKey,
                  extension: track.extension ?? null,
                  mimeType: track.mimeType ?? null,
                  sizeBytes: track.sizeBytes,
                  downloadedAt: new Date(),
                },
              ],
            },
          },
        });

        productSlugs.push(product.slug);

        await tx.albumItem.create({
          data: { albumId: album.id, productId: product.id, position: index + 1 },
        });
      }
    });

    await syncProductCount(user.id);
  } catch (err) {
    console.error("createAlbum failed", err);
    return { error: "Something went wrong saving that album. Please try again." };
  }

  revalidateAlbum({ username: user.username, category, slug: albumSlug, productSlugs });
  redirect(`/dashboard/albums?created=${asDraft ? "draft" : "live"}`);
}

/** Edits the album's own fields. Membership and per-item prices are separate. */
export async function updateAlbum(
  _prev: AlbumFormState,
  formData: FormData,
): Promise<AlbumFormState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const albumId = String(formData.get("albumId") ?? "");
  const existing = await db.album.findUnique({
    where: { id: albumId },
    include: { items: { include: { product: { select: { slug: true } } } } },
  });
  // Ownership re-checked here, not inferred from whoever rendered the form.
  if (!existing || existing.vendorId !== user.id) {
    return { error: "That album isn't yours to edit." };
  }

  const fields = parseAlbumFields(formData);
  if ("error" in fields) return { error: fields.error };
  const { title, description, category, licence, suggested, minimum } = fields.values;

  // The cover is optional on edit and means "replace".
  let cover: z.infer<typeof uploadSchema> | null = null;
  const coverRaw = String(formData.get("cover") ?? "");
  if (coverRaw) {
    const parsed = uploadSchema.safeParse(
      (() => {
        try {
          return JSON.parse(coverRaw);
        } catch {
          return null;
        }
      })(),
    );
    if (!parsed.success) {
      return { error: "That cover didn't upload properly. Please try again." };
    }
    if (checkOwnership(user.id, [parsed.data], "public")) {
      return { error: "That cover didn't come from this upload. Please try again." };
    }
    cover = parsed.data;
  }

  const oldCoverKey =
    cover && existing.coverImageUrl
      ? existing.coverImageUrl.replace(/^\/media\//, "")
      : null;

  try {
    await db.album.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        category,
        licence,
        suggestedPriceCents: suggested,
        minimumPriceCents: minimum,
        ...(cover ? { coverImageUrl: cover.publicUrl ?? null } : {}),
      },
    });
    // Raising the album's floor has to reach its members, or the bypass this
    // closes simply reopens on the next edit. Raised only — a member given a
    // higher floor of its own keeps it.
    const floor = memberFloor(minimum, existing.items.length);
    if (floor > 0) {
      await db.product.updateMany({
        where: {
          id: { in: existing.items.map((i) => i.productId) },
          minimumPriceCents: { lt: floor },
        },
        data: { minimumPriceCents: floor },
      });
      // A suggestion below the new floor would be rejected at checkout.
      await db.product.updateMany({
        where: {
          id: { in: existing.items.map((i) => i.productId) },
          suggestedPriceCents: { lt: floor },
        },
        data: { suggestedPriceCents: floor },
      });
    }
  } catch (err) {
    console.error("updateAlbum failed", err);
    return { error: "Something went wrong saving that. Please try again." };
  }

  // Only once nothing in the database points at it, and only if the members
  // are not still showing the same picture.
  if (oldCoverKey) {
    const stillUsed = await db.product.count({
      where: { coverImageUrl: `/media/${oldCoverKey}` },
    });
    if (stillUsed === 0) await removeUpload(oldCoverKey);
  }

  revalidateAlbum({
    username: user.username,
    category,
    slug: existing.slug,
    productSlugs: existing.items.map((i) => i.product.slug),
  });
  if (category !== existing.category) {
    revalidateAlbum({ username: user.username, category: existing.category });
  }
  redirect("/dashboard/albums?updated=1");
}

export type AlbumActionState = { error?: string } | undefined;

/**
 * Publishes or unpublishes an album *and its members together*.
 *
 * They have to move as one. A live album with unpublished members is a page of
 * dead links; unpublished members under a live album cannot be bought
 * individually, which is half of what the client asked for.
 */
export async function setAlbumStatus(
  _prev: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const albumId = String(formData.get("albumId") ?? "");
  const publish = formData.get("status") === "publish";

  const album = await db.album.findUnique({
    where: { id: albumId },
    include: {
      items: {
        include: { product: { select: { id: true, slug: true, status: true } } },
      },
    },
  });
  if (!album || album.vendorId !== user.id) {
    return { error: "That album isn't yours." };
  }

  const memberIds = album.items
    // FLAGGED means an import held that item for review. A vendor must not be
    // able to clear it by publishing the album it happens to sit in.
    .filter((i) => i.product.status !== ProductStatus.FLAGGED)
    .map((i) => i.product.id);

  await db.$transaction([
    db.album.update({
      where: { id: album.id },
      data: {
        status: publish ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
        ...(publish && !album.publishedAt ? { publishedAt: new Date() } : {}),
      },
    }),
    db.product.updateMany({
      where: { id: { in: memberIds } },
      data: {
        status: publish ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
        ...(publish ? { publishedAt: new Date() } : {}),
      },
    }),
  ]);

  await syncProductCount(user.id);
  revalidateAlbum({
    username: user.username,
    category: album.category,
    slug: album.slug,
    productSlugs: album.items.map((i) => i.product.slug),
  });
  return undefined;
}

/**
 * Deletes an album.
 *
 * Members are products in their own right and may have sold separately, so
 * they are never deleted here — only the album and its membership rows go.
 * They return to the catalogue as ordinary standalone items, which is exactly
 * what they then are.
 */
export async function deleteAlbum(
  _prev: AlbumActionState,
  formData: FormData,
): Promise<AlbumActionState> {
  const user = await requireUser();
  if (!user || user.role === UserRole.BUYER) {
    return { error: "You need a creator account to do that." };
  }

  const albumId = String(formData.get("albumId") ?? "");
  const album = await db.album.findUnique({
    where: { id: albumId },
    include: {
      items: { include: { product: { select: { slug: true } } } },
      _count: { select: { orders: true } },
    },
  });
  if (!album || album.vendorId !== user.id) {
    return { error: "That album isn't yours." };
  }

  if (album._count.orders > 0) {
    return {
      error:
        "Someone has bought this album, so it can't be deleted — their record of the purchase points at it. Unpublish it instead and it disappears from the site.",
    };
  }

  const productSlugs = album.items.map((i) => i.product.slug);
  const coverKey = album.coverImageUrl?.replace(/^\/media\//, "") ?? null;

  try {
    // `AlbumItem` cascades; the products it referenced are deliberately left
    // standing.
    await db.album.delete({ where: { id: album.id } });
  } catch (err) {
    console.error("deleteAlbum failed", err);
    return { error: "Something went wrong deleting that. Please try again." };
  }

  if (coverKey) {
    // Members were given the same cover at creation, so it is only safe to
    // remove once nothing else still points at it.
    const stillUsed = await db.product.count({
      where: { coverImageUrl: `/media/${coverKey}` },
    });
    if (stillUsed === 0) await removeUpload(coverKey);
  }

  revalidateAlbum({
    username: user.username,
    category: album.category,
    slug: album.slug,
    productSlugs,
  });
  return undefined;
}
