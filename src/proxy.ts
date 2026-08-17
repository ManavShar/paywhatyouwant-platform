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
  // Everything except Next's build assets, which carry no content of their
  // own and are requested before the browser has offered credentials.
  matcher: ["/((?!_next/static|_next/image/fallback|favicon.ico).*)"],
};

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
