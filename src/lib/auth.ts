import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { db } from "./db";

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
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
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

/** The signed-in user, or null. Safe to call from any server component. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
