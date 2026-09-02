"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ProductStatus } from "@prisma/client";
import { setAlbumStatus, deleteAlbum } from "@/lib/actions/albums";
import { cn } from "@/lib/utils";

/**
 * Edit, publish/unpublish and delete for one album.
 *
 * The delete warning differs from the product one in the way that matters:
 * deleting an album does *not* delete the work inside it. Each item is a
 * product in its own right and may have sold separately, so they stay in the
 * catalogue as standalone items — and saying so is the difference between a
 * creator tidying up and a creator destroying an afternoon's uploading.
 */
export function AlbumRowActions({
  albumId,
  status,
  itemCount,
  sold,
}: {
  albumId: string;
  status: ProductStatus;
  itemCount: number;
  sold: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setAlbumStatus,
    undefined,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteAlbum,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  const published = status === ProductStatus.PUBLISHED;
  const error = statusState?.error ?? deleteState?.error;

  return (
    <div className="shrink-0 text-right">
      <div className="flex items-center justify-end gap-1">
        <Link
          href={`/dashboard/albums/${albumId}`}
          className={linkClass}
          aria-label="Edit this album"
        >
          Edit
        </Link>

        <form action={statusAction}>
          <input type="hidden" name="albumId" value={albumId} />
          <input
            type="hidden"
            name="status"
            value={published ? "unpublish" : "publish"}
          />
          <button type="submit" disabled={statusPending} className={linkClass}>
            {statusPending ? "…" : published ? "Unpublish" : "Publish"}
          </button>
        </form>

        {!sold &&
          (confirming ? (
            <form action={deleteAction} className="flex items-center gap-1">
              <input type="hidden" name="albumId" value={albumId} />
              <button
                type="submit"
                disabled={deletePending}
                className={cn(linkClass, "text-danger")}
              >
                {deletePending ? "Deleting…" : "Delete the album"}
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
        <p className="mt-1 max-w-[18rem] text-right text-xs leading-relaxed text-ink-subtle">
          The {itemCount} {itemCount === 1 ? "item" : "items"} inside stay in
          your catalogue as separate products — only the collection goes.
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
