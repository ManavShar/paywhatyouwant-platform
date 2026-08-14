"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Wraps the app so the header can show who is signed in.
 *
 * Deliberately a client-side session rather than reading cookies in the header
 * on the server: touching cookies in a shared layout would opt every static
 * page (about, terms, the category pages) out of prerendering, to change two
 * links. The cost is that the account menu resolves just after hydration.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
