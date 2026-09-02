import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireVendor } from "@/lib/auth";
import { ProductForm } from "@/components/vendor/ProductForm";
import { updateProduct } from "@/lib/actions/products";
import { formatAmountForInput } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit product" };

/**
 * Editing a product after it is up.
 *
 * Until now `createProduct` was the only action that existed, so a typo in a
 * title, a wrong price or the wrong cover image was permanent — and a draft
 * was worse than permanent, because there was no way to publish it either.
 */
export default async function EditProductPage(
  props: PageProps<"/dashboard/products/[id]">,
) {
  const { id } = await props.params;
  const user = await requireVendor();

  const product = await db.product.findUnique({
    where: { id },
    include: { files: true, tags: { include: { tag: true } } },
  });

  // Someone else's product is indistinguishable from one that doesn't exist.
  if (!product || product.vendorId !== user.id) notFound();

  const paidFile = product.files.find((f) => !f.isPreview);
  const previewFile = product.files.find((f) => f.isPreview);

  return (
    <div>
      <header className="mb-8">
        <Link
          href="/dashboard/products"
          className="text-sm font-semibold text-ink-muted hover:text-ink"
        >
          ← Your products
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
          Edit &ldquo;{product.title}&rdquo;
        </h1>
        <p className="mt-1 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
          {product.status === ProductStatus.PUBLISHED
            ? "This is live. Changes appear on the site as soon as you save."
            : "This is a draft — nobody can see it yet. Publish it from your products list when you're ready."}
        </p>
      </header>

      <ProductForm
        action={updateProduct}
        initial={{
          id: product.id,
          title: product.title,
          description: product.description,
          category: product.category,
          licence: product.licence,
          tags: product.tags.map((t) => t.tag.name).join(", "),
          suggestedPrice: formatAmountForInput(product.suggestedPriceCents),
          minimumPrice: formatAmountForInput(product.minimumPriceCents),
          coverImageUrl: product.coverImageUrl,
          productFileName: paidFile?.fileName ?? null,
          previewFileName: previewFile?.fileName ?? null,
        }}
      />
    </div>
  );
}
