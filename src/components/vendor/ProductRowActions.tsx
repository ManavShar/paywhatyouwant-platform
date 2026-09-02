"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ProductStatus } from "@prisma/client";
import { setProductStatus, deleteProduct } from "@/lib/actions/products";
import { cn } from "@/lib/utils";

/**
 * Edit, publish/unpublish and delete for one row of the products list.
 *
 * Deleting confirms inline rather than through `window.confirm`. A native
 * dialog blocks the whole page, cannot be styled to say *why* something is
 * about to disappear, and on this list the honest warning is specific: the
 * files go with it.
 */
export function ProductRowActions({
  productId,
  status,
  sold,
}: {
  productId: string;
  status: ProductStatus;
  sold: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setProductStatus,
    undefined,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProduct,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  const published = status === ProductStatus.PUBLISHED;
  const flagged = status === ProductStatus.FLAGGED;
  const error = statusState?.error ?? deleteState?.error;

  return (
    <div className="shrink-0 text-right">
      <div className="flex items-center justify-end gap-1">
        <Link
          href={`/dashboard/products/${productId}`}
          className={linkClass}
          aria-label="Edit this product"
        >
          Edit
        </Link>

        {!flagged && (
          <form action={statusAction}>
            <input type="hidden" name="productId" value={productId} />
            <input
              type="hidden"
              name="status"
              value={published ? "unpublish" : "publish"}
            />
            <button type="submit" disabled={statusPending} className={linkClass}>
              {statusPending
                ? "…"
                : published
                  ? "Unpublish"
                  : "Publish"}
            </button>
          </form>
        )}

        {/* A product that has sold cannot be deleted at all — the order lines
            point at it. Saying so up front beats offering a button that always
            fails. */}
        {!sold &&
          (confirming ? (
            <form action={deleteAction} className="flex items-center gap-1">
              <input type="hidden" name="productId" value={productId} />
              <button
                type="submit"
                disabled={deletePending}
                className={cn(linkClass, "text-danger")}
              >
                {deletePending ? "Deleting…" : "Delete for good"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={linkClass}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={cn(linkClass, "text-ink-muted hover:text-danger")}
            >
              Delete
            </button>
          ))}
      </div>

      {confirming && !deletePending && (
        <p className="mt-1 max-w-[16rem] text-right text-xs leading-relaxed text-ink-subtle">
          This removes the uploaded files too. It cannot be undone.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-1 max-w-[18rem] text-right text-xs leading-relaxed text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const linkClass =
  "rounded-control px-2 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-hover disabled:opacity-50";
