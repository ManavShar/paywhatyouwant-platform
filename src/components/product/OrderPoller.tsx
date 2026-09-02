"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 2000;
const GIVE_UP_MS = 40_000;

/**
 * Waits for the webhook while the buyer watches.
 *
 * An order only becomes COMPLETED when Stripe's signed webhook says the money
 * moved, which is right — the redirect back proves nothing. But the page that
 * said "refresh in a moment" had no way of ever resolving itself, so a buyer
 * who had genuinely paid sat refreshing by hand, and a buyer whose webhook
 * never arrived sat there forever with no error and nothing to do.
 *
 * So: refresh on a short interval, and after forty seconds stop and say
 * plainly that something has gone wrong, rather than spinning indefinitely.
 */
export function OrderPoller() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const started = Date.now();

    const tick = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) {
        clearInterval(tick);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);

    return () => clearInterval(tick);
  }, [router]);

  if (!gaveUp) {
    return (
      <p className="mt-6 text-sm text-ink-subtle" role="status">
        Checking with Stripe…
      </p>
    );
  }

  return (
    <div className="mt-8 rounded-card border border-hairline bg-surface p-5 text-left">
      <p className="text-sm font-semibold text-ink">
        This is taking longer than it should
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        If your card was charged, the payment is safe and the download will
        appear here — reload this page in a few minutes. If it still hasn&apos;t,
        email <span className="font-medium text-ink">info@paywhatyouwant.io</span>{" "}
        with this page&apos;s address and we&apos;ll sort it out.
      </p>
    </div>
  );
}
