"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PriceControl } from "@/components/pricing/PriceControl";

/**
 * Wraps the price control with the actual purchase call.
 *
 * On desktop this panel is sticky, so the decision point never scrolls away.
 * On phones it sits inline in the normal flow — a fixed bottom bar would eat
 * scarce vertical space on exactly the screens that have least of it.
 */
export function PurchasePanel({
  productSlug,
  suggestedPriceCents,
  minimumPriceCents,
  creatorName,
}: {
  productSlug: string;
  suggestedPriceCents: number;
  minimumPriceCents: number;
  creatorName: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function purchase(amountCents: number) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug, amountCents }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      if (data.free) {
        router.push(data.downloadUrl);
        return;
      }
      // Full-page navigation: Stripe Checkout is a hosted page, not an embed.
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PriceControl
        suggestedPriceCents={suggestedPriceCents}
        minimumPriceCents={minimumPriceCents}
        creatorName={creatorName}
        onSubmit={purchase}
        submitting={submitting}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
