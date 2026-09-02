import { NextResponse, type NextRequest } from "next/server";

/**
 * Password gate for the private preview.
 *
 * The site is deployed so Max can look at it whenever he likes, but it holds
 * 107 creators' works and the pay-what-you-want flow allows $0 — so on an open
 * URL anyone who found it could take every full-resolution original for
 * nothing. Until launch, the whole site sits behind one shared password.
 *
 * HTTP Basic rather than a login page, deliberately: it covers *everything*
 * including API routes, image optimisation and file downloads, with no way to
 * reach a byte of content around it. A login page would have to be wired into
 * each route and would leave the `/api/download/...` stream exposed unless it
 * were done perfectly.
 *
 * Set PREVIEW_PASSWORD to switch it on. With the variable unset the gate does
 * nothing at all, which keeps local development and `npm run demo:setup`
 * exactly as they were, and means shipping to production without setting it
 * fails open *visibly* (the site is simply public) rather than silently
 * locking Max out.
 */

export const config = {
  // Everything except Next's build assets, which carry no content of their own
  // and are requested before the browser has offered credentials — and media
  // files (covers, previews, avatars, the video poster, the logo marks),
  // matched by extension, which must stay open for the reason below — and the
  // Stripe webhook, for the reason below that.
  //
  // Written out in full rather than composed from a constant: Next parses this
  // matcher at build time and rejects anything that is not a literal string.
  matcher: [
    "/((?!_next/static|_next/image/fallback|favicon.ico|api/stripe/webhook|[^?]*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp3|wav|mp4|webm|woff2?)).*)",
  ],
};

/**
 * Why static files are exempt.
 *
 * `next/image` optimises a local image by fetching it back off this same
 * server, and that internal request carries no credentials. With those files
 * gated it received the 401 challenge instead of a picture, and every
 * optimised image on the site failed with "The requested resource isn't a
 * valid image ... received null" — which is exactly what Max saw as blank
 * product pages and a blank video poster. The homepage grid looked fine only
 * because its renders were already sitting in `.next/cache/images` from before
 * the gate existed, which is what made the fault look like it was about image
 * size rather than about authentication.
 *
 * The exemption gives away nothing the gate was protecting, and exactly one
 * fact keeps that true: `/media/[...key]` serves `storage/public-media` and
 * nothing else. Everything in that tree is already the public face of the site
 * — covers, free previews, avatars and post images are put there precisely so
 * they can be shown. Every paid file lives in the sibling tree `storage/media`
 * and is reachable only through `/api/download/[token]` against a completed
 * order.
 *
 * That distinction is load-bearing. Many migrated keys are guessable WordPress
 * paths (`2018/08/beach-photos-2.jpg`), so if the media route were ever
 * repointed at `storage/media`, this exemption would publish the entire paid
 * catalogue to anyone who guessed a filename — no password, no purchase. If
 * that route changes, this exemption has to be re-argued from scratch.
 *
 * Without the password you still cannot browse the site, search it, or discover
 * a single one of these URLs.
 */

/**
 * Why the Stripe webhook is exempt.
 *
 * It is the only route here that a machine calls rather than a person. Stripe
 * has no password to offer, so behind the gate every delivery gets a 401 — and
 * since the webhook is the *only* place an order is allowed to become
 * COMPLETED, a buyer would pay, be charged, and then sit on "confirming your
 * payment" forever while their download was never issued. Silent on the site
 * and invisible in the dashboard: the worst combination.
 *
 * The exemption costs nothing, because the route never trusted the caller in
 * the first place. It verifies an HMAC signature over the raw body against
 * `STRIPE_WEBHOOK_SECRET` and rejects anything unsigned or altered with a 400
 * — a stronger check than the shared password this gate applies, and the one
 * Stripe intends. It serves nothing readable either: the handler answers
 * `{received:true}` and nothing more.
 */

/** Constant-time string comparison — avoids leaking the password by timing. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function challenge() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Paywhatyouwant preview", charset="UTF-8"',
      // A gated preview must never be cached by an intermediary and handed to
      // someone who did not authenticate.
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest) {
  const expected = process.env.PREVIEW_PASSWORD;
  if (!expected) return NextResponse.next();

  const expectedUser = process.env.PREVIEW_USERNAME ?? "preview";

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return challenge();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return challenge();
  }

  // Only the first colon separates the pair — passwords may contain colons.
  const separator = decoded.indexOf(":");
  if (separator === -1) return challenge();

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  // Both compared, and neither short-circuited, so a wrong username costs the
  // same as a wrong password.
  const userOk = safeEqual(user, expectedUser);
  const passwordOk = safeEqual(password, expected);
  if (!userOk || !passwordOk) return challenge();

  return NextResponse.next();
}
