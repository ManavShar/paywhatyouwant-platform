import type { MetadataRoute } from "next";

/**
 * Evaluated per request, not at build time.
 *
 * Next prerenders this by default, which would freeze whichever state the
 * build happened to run in. That is a trap on launch day: unset
 * `PREVIEW_PASSWORD`, restart, and the site would still be serving a
 * build-time `Disallow: /` — telling every crawler to stay away from a shop
 * that had just opened, with nothing on the page to suggest why.
 */
export const dynamic = "force-dynamic";

/**
 * What crawlers may look at.
 *
 * There was no robots file at all, which for a marketplace that lives on
 * discovery is not a small omission — but the more important job here is the
 * opposite one. While `PREVIEW_PASSWORD` is set the whole site sits behind
 * HTTP Basic auth, and a crawler that somehow reached it must be told to go
 * away rather than index a half-finished shop under the client's domain. The
 * gate already answers 401 to everything, so this is belt and braces; it costs
 * one condition and removes a category of embarrassment.
 *
 * The disallow list is about privacy and waste rather than secrecy. Nothing
 * under it is reachable without the right session or token anyway — see
 * `src/app/order/[id]/page.tsx` and `src/lib/downloads.ts` — but a search
 * result pointing at somebody's download link would be a poor thing to have
 * to explain, and crawling `/api` burns budget on JSON nobody searches for.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const isPrivatePreview = Boolean(process.env.PREVIEW_PASSWORD);

  if (isPrivatePreview) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/purchases",
        "/order/",
        "/download/",
        "/recover",
        // The embeddable widget is meant to be framed by other sites, not to
        // compete with the real product page in search results.
        "/embed/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
