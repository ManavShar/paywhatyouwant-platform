import { headers } from "next/headers";
import { db } from "./db";

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * The site had none. Fifteen wrong passwords in a row were accepted without a
 * pause, and twelve anonymous free "purchases" all succeeded — which meant a
 * creator's public download count could be inflated by anyone with a loop, and
 * a password could be guessed at whatever rate the network allowed.
 *
 * Postgres rather than an in-process map because the protection has to survive
 * a restart. An in-memory counter is defeated by waiting for a deploy, and it
 * is defeated immediately if the app is ever run as more than one process.
 *
 * Fixed windows, not a token bucket: the failure mode of a fixed window is
 * that someone gets up to 2x the allowance across a window boundary, which is
 * harmless at these limits, and the whole thing is one statement with no
 * background sweeping.
 */

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the caller may try again. Only meaningful when `ok` is false. */
  retryAfter: number;
  remaining: number;
};

/**
 * Counts one hit against `key` and says whether it is allowed.
 *
 * The increment and the window roll happen in a single statement so two
 * simultaneous requests cannot both read a stale count and both be let
 * through — the exact race a login limiter has to survive, since that is what
 * a guesser will do on purpose.
 */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowEnd = new Date(Date.now() + windowSeconds * 1000);

  try {
    const rows = await db.$queryRaw<{ count: number; windowEnd: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowEnd")
      VALUES (${key}, 1, ${windowEnd})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowEnd" < now() THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "windowEnd" = CASE
          WHEN "RateLimit"."windowEnd" < now() THEN ${windowEnd}
          ELSE "RateLimit"."windowEnd"
        END
      RETURNING "count", "windowEnd"
    `;

    const row = rows[0];
    if (!row) return { ok: true, retryAfter: 0, remaining: limit };

    const remaining = Math.max(0, limit - row.count);
    if (row.count > limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((row.windowEnd.getTime() - Date.now()) / 1000),
      );
      return { ok: false, retryAfter, remaining: 0 };
    }

    return { ok: true, retryAfter: 0, remaining };
  } catch (err) {
    // Fail open, deliberately. A rate limiter that takes the site down when
    // the database hiccups has caused a worse outage than the abuse it
    // prevents — and every path this guards has its own authorisation check
    // behind it.
    console.error("rate limit check failed", err);
    return { ok: true, retryAfter: 0, remaining: limit };
  }
}

/**
 * The client address, as far as it can be trusted.
 *
 * This function was wrong in a way worth spelling out, because the wrong
 * version is the one almost everyone writes: it took the **leftmost** entry of
 * `X-Forwarded-For`. That entry is whatever the caller put there. Sending a
 * different `X-Forwarded-For` on each request defeated the checkout limiter
 * completely — forty requests, forty "distinct" clients, nothing blocked.
 *
 * The list grows left to right, each proxy appending the address it received
 * the connection from. So the **rightmost** entry is the one written by the
 * hop nearest us, and the only one a client cannot choose. Anything further
 * left may be invention.
 *
 * `CF-Connecting-IP` is preferred where present because Cloudflare *replaces*
 * it at the edge rather than appending, so a forged value never survives.
 *
 * This assumes the app is only reachable through its proxy — true here, where
 * Next listens on localhost and the tunnel is the only way in. If it is ever
 * exposed directly, both headers become attacker-controlled again and this
 * needs a trusted-proxy list.
 */
function pickIp(cfConnecting: string | null, forwarded: string | null, real: string | null): string {
  if (cfConnecting) return cfConnecting.trim();

  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    // Rightmost: appended by the nearest proxy, not by the caller.
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }

  return real?.trim() ?? "unknown";
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return pickIp(
    h.get("cf-connecting-ip"),
    h.get("x-forwarded-for"),
    h.get("x-real-ip"),
  );
}

/** Same as `clientIp`, for route handlers that already hold the Request. */
export function clientIpFrom(request: Request): string {
  return pickIp(
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
  );
}

/**
 * The limits, in one place so they can be argued about as a set.
 *
 * Each is meant to be invisible to a real person and obstructive to a script.
 * A buyer might genuinely download the same file a few times in a minute; no
 * buyer starts thirty checkouts an hour.
 */
export const LIMITS = {
  /** Per IP. Generous, because a household or office shares an address. */
  login: { limit: 20, windowSeconds: 15 * 60 },
  /** Per account being targeted — the one a guesser cannot spread across IPs. */
  loginAccount: { limit: 10, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  checkout: { limit: 30, windowSeconds: 60 * 60 },
  upload: { limit: 120, windowSeconds: 60 * 60 },
  /** Sending mail to an address someone else may own: keep this tight. */
  emailSend: { limit: 5, windowSeconds: 60 * 60 },
  reissue: { limit: 20, windowSeconds: 60 * 60 },
} as const;

/** Convenience wrapper: `limit("login", ip)`. */
export function limit(
  name: keyof typeof LIMITS,
  discriminator: string,
): Promise<RateLimitResult> {
  const { limit: max, windowSeconds } = LIMITS[name];
  return consume(`${name}:${discriminator}`, max, windowSeconds);
}
