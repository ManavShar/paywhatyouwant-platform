"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

type Status = "not-connected" | "incomplete" | "ready";

/**
 * Connect onboarding entry point.
 *
 * Three states, said plainly. The old site's answer to "how do I get paid"
 * was a dashboard note telling vendors to email info@paywhatyouwant.io — so
 * being explicit about exactly where a creator stands is the whole point of
 * this screen, not decoration.
 */
export function ConnectPayouts({
  initialStatus,
  configured,
  justReturned = false,
}: {
  initialStatus: Status;
  /** False when the server has no Stripe key, which is the normal state in development. */
  configured: boolean;
  /** True on the way back from Stripe-hosted onboarding. */
  justReturned?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Ask Stripe directly, once, on the way back from onboarding.
   *
   * `GET /api/stripe/connect` re-reads the capability and stores the answer.
   * It was written for exactly this moment and nothing called it, so the page
   * promised it "updates as soon as they confirm" while depending entirely on
   * the `account.updated` webhook — which is not running at all unless someone
   * has configured a webhook secret.
   */
  useEffect(() => {
    if (!justReturned || initialStatus === "ready" || !configured) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/connect");
        const data = await res.json();
        if (!cancelled && data.ready) router.refresh();
      } catch {
        // Silent: the webhook and a manual refresh both still cover this.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [justReturned, initialStatus, configured, router]);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start onboarding.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach Stripe. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  if (initialStatus === "ready") {
    return (
      <div className="rounded-card border border-hairline p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-success"
            aria-hidden
          />
          <div>
            <p className="font-semibold text-ink">You&apos;re set up to get paid</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              Your share of every sale goes straight to your own Stripe account.
              Nothing to request, nobody to email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-hairline p-5">
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-warning"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {initialStatus === "incomplete"
              ? "Finish setting up payouts"
              : "Set up payouts"}
          </p>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            {initialStatus === "incomplete"
              ? "Stripe still needs a few details before it can send you money. You can pick up where you left off."
              : "Connect a Stripe account so buyers' payments reach you directly. It takes a couple of minutes and you can keep selling while it's pending."}
          </p>

          {!configured && (
            <p className="mt-3 rounded-control border border-hairline bg-surface p-3 text-xs leading-relaxed text-ink-muted">
              Payments aren&apos;t configured on this server yet, so this button
              will report that rather than opening Stripe. Add{" "}
              <code className="rounded bg-canvas px-1 py-0.5">
                STRIPE_SECRET_KEY
              </code>{" "}
              to <code className="rounded bg-canvas px-1 py-0.5">.env</code> to
              enable it.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? "Opening Stripe…" : "Continue on Stripe"}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
