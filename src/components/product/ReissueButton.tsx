"use client";

import { useActionState } from "react";
import { RotateCw } from "lucide-react";
import { reissueGrant } from "@/lib/actions/purchases";

/**
 * "Get a new link" for a purchase whose grant has expired or been used up.
 *
 * A client component only so the error has somewhere to appear — the action
 * redirects to the fresh download page on success, so the happy path never
 * comes back here.
 */
export function ReissueButton({
  orderId,
  productId,
}: {
  orderId: string;
  productId: string;
}) {
  const [state, action, pending] = useActionState(reissueGrant, undefined);

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-control border border-hairline-strong px-4 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
      >
        <RotateCw className="h-4 w-4" aria-hidden />
        {pending ? "One moment…" : "New link"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
