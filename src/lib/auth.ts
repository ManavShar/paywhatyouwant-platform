import { redirect } from "next/navigation";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { db } from "./db";
import { limit, clientIp } from "./rate-limit";

/**
 * Auth.js v5, email + password.
 *
 * JWT sessions rather than database sessions: the Credentials provider only
 * supports JWT, and it keeps every dashboard page render free of a session
 * lookup. The Account/Session tables stay in the schema unused so an OAuth
 * provider can be added later without a migration.
 *
 * The session carries `role` and `username` because almost every guarded page
 * needs one or both, and re-fetching the user on each render to learn them
 * would defeat the point of a stateless session.
 */

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Rate limiting lives here, not in the `login` Server Action.
       *
       * The action is only one way in. `POST /api/auth/callback/credentials`
       * is a public endpoint that reaches this function directly, and that is
       * the path a guesser actually uses — fifteen wrong passwords through it
       * were previously accepted without a pause. Guarding the action would
       * have looked like a fix and stopped nothing.
       *
       * Two counters, because either alone is evadable: per IP catches one
       * machine working through an account, and per account catches a
       * distributed attempt on one target. The address is spoofable, the
       * account being attacked is not.
       */
      async authorize(raw) {
        // Counted *before* validation, deliberately. Validation rejects a
        // password shorter than eight characters, so counting afterwards meant
        // a guesser could burn unlimited attempts for free simply by padding
        // to seven characters — the counter would never see them. Whatever
        // arrives here is an attempt on this account and is counted as one.
        const attemptedEmail =
          typeof (raw as { email?: unknown })?.email === "string"
            ? (raw as { email: string }).email.toLowerCase().slice(0, 200)
            : "unknown";

        const [byIp, byAccount] = await Promise.all([
          limit("login", await clientIp()),
          limit("loginAccount", attemptedEmail),
        ]);
        // Returning null rather than throwing: Auth.js turns a throw here into
        // a 500, and the caller learns nothing useful from the difference
        // anyway.
        //
        // The trade-off, stated plainly: because the account counter is
        // consulted before the password is checked, someone can lock a known
        // address out by making ten wrong attempts against it. That is a real
        // nuisance, and it is the lesser evil — it expires by itself in
        // fifteen minutes and locks nobody out permanently, whereas the
        // alternative (check the password first, count only failures) leaves
        // an unlimited number of guesses available against every account on
        // the site. With an eight-character minimum password, unlimited
        // guessing is the bigger risk.
        if (!byIp.ok || !byAccount.ok) return null;

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        const user = await db.user.findUnique({
          where: { email },
        });

        // Accounts imported from WordPress have no password set. Returning
        // null here (rather than erroring) means an attacker cannot tell an
        // imported account apart from a non-existent one.
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.username,
          role: user.role,
          username: user.username,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.username = user.username;
      }
      // Lets a vendor who just completed onboarding see the change without
      // signing out and back in.
      if (trigger === "update" && session?.role) {
        token.role = session.role as UserRole;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.username = token.username as string;
      }
      return session;
    },
  },
});

/**
 * The signed-in user as described by their session token.
 *
 * Cheap — no database round trip — but the token is a *snapshot* taken at
 * sign-in. It keeps asserting whatever was true then, so it must not be the
 * last word on anything that can change or be revoked. Use it for cosmetic
 * decisions (which links the header shows) and `requireUser` for the rest.
 */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * The signed-in user, verified against the database.
 *
 * Returns null if the account no longer exists. This matters because sessions
 * here are JWTs: deleting or suspending an account does not invalidate a token
 * that was already issued, so a removed user would otherwise keep access until
 * it expired — up to 30 days. Verified during testing, where an account
 * deleted from the database went on authenticating happily.
 *
 * It also returns the *current* role rather than the one baked into the token,
 * so a creator who was upgraded from buyer does not have to sign out and back
 * in before the dashboard lets them in.
 *
 * Use this anywhere access is granted or data is written.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, username: true, name: true, role: true },
  });

  return user;
}

/**
 * The signed-in creator, or a redirect.
 *
 * Dashboard pages used to write `(await requireUser())!`, trusting the layout
 * guard to have already redirected. That assertion is a lie: a layout and the
 * page beneath it are evaluated together, so a rejected user reached the page
 * body and it crashed on a null dereference instead of redirecting. Each page
 * asks for itself, and the redirect happens wherever the answer is no.
 */
export async function requireVendor() {
  const user = await requireUser();
  if (!user) redirect("/signin?next=/dashboard");
  if (user.role === UserRole.BUYER) redirect("/sell");
  return user;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
