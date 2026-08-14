import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Auth.js ships a minimal User/Session shape. The app leans on `role` and
 * `username` everywhere (dashboard guards, vendor URLs), so they are declared
 * once here rather than cast at each call site.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      username: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    username: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    username: string;
  }
}
