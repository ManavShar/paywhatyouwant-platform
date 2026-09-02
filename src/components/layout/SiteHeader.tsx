import { requireUser } from "@/lib/auth";
import { HeaderNav } from "./HeaderNav";

/**
 * Slim, sticky, and mostly out of the way — the catalogue is the point.
 *
 * Identity is resolved *here*, on the server, and handed to the nav as a prop.
 * It used to be read client-side with `useSession`, which meant every page
 * shipped signed-out markup and only corrected itself after hydration, once a
 * browser round trip to `/api/auth/session` came back. Max reviewed the site
 * signed in and reported that it "still says sign in": that round trip is one
 * more thing to be slow or fail, and while it is in flight the header is
 * actively lying about who you are.
 *
 * `requireUser` rather than `currentUser`: the session is a JWT issued at
 * sign-in and valid for thirty days, so it keeps asserting whatever was true
 * then. A buyer who turns on their creator account would have gone on being
 * shown "Start selling" with no Dashboard link until the token expired, and
 * the same staleness hides an account that has since been deleted. One indexed
 * lookup by id is worth not lying about who someone is.
 *
 * The real price is that reading a cookie opts a route out of static
 * prerendering — paid for on the homepage by caching its catalogue queries
 * instead (see `src/lib/queries.ts`), which is where the expense actually was.
 */
export async function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  const user = await requireUser();

  return (
    <HeaderNav
      showSearch={showSearch}
      user={
        user
          ? {
              name: user.name ?? null,
              username: user.username,
              role: user.role,
            }
          : null
      }
    />
  );
}
