"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { signIn, hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { limit, clientIp } from "@/lib/rate-limit";

export type FormState = { error?: string } | undefined;

const registerSchema = z
  .object({
    email: z.string().email("That doesn't look like an email address"),
    username: z
      .string()
      .min(3, "At least 3 characters")
      .max(30, "At most 30 characters")
      // Hyphens but not underscores, and the message says so. The rule used to
      // advertise underscores while `slugify` quietly turned them into
      // hyphens, so the form accepted "max_rangeley" and then refused it with
      // "that username can't be used in a web address" — a dead end for a
      // perfectly reasonable name.
      .regex(
        /^[a-zA-Z0-9-]+$/,
        "Letters, numbers and hyphens only — no spaces or underscores",
      ),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
    isVendor: z.boolean(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Those two passwords don't match",
    path: ["confirmPassword"],
  });

export async function register(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Registration writes a row and sends nothing, so the abuse here is bulk
  // account creation rather than anything clever. Five an hour from one
  // address is far more than a household needs.
  const gate = await limit("register", await clientIp());
  if (!gate.ok) {
    return {
      error: "Too many accounts created from here recently. Try again later.",
    };
  }

  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    isVendor: formData.get("isVendor") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }
  const { email, username, password, isVendor } = parsed.data;

  // The username becomes the public vendor URL, so it must survive slugifying
  // unchanged — otherwise /vendor/<username> would not resolve.
  const slug = slugify(username);
  if (slug !== username.toLowerCase()) {
    return { error: "That username can't be used in a web address" };
  }

  const clash = await db.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username: slug }] },
    select: { email: true },
  });
  if (clash) {
    return {
      error:
        clash.email === email.toLowerCase()
          ? "An account with that email already exists"
          : "That username is taken",
    };
  }

  // The check above is a courtesy that gives a specific message; this is the
  // guarantee. Between the two, a second signup with the same name can slip
  // through and hit the unique index — which used to surface as an unhandled
  // exception and a generic error page.
  try {
    await db.user.create({
      data: {
        email: email.toLowerCase(),
        username: slug,
        name: username,
        passwordHash: await hashPassword(password),
        role: isVendor ? UserRole.VENDOR : UserRole.BUYER,
        vendorSince: isVendor ? new Date() : null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = String(err.meta?.target ?? "");
      return {
        error: target.includes("email")
          ? "An account with that email already exists"
          : "That username is taken",
      };
    }
    throw err;
  }

  // Sign straight in — making someone register and then log in immediately
  // afterwards is friction with no security benefit.
  await signIn("credentials", {
    email,
    password,
    redirectTo: isVendor ? "/dashboard" : "/browse",
  });
}

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Where they were going, or home. It used to default to `/dashboard`, which
  // a buyer's account is not allowed into — so signing in from the header sent
  // them to the dashboard, which bounced them to the sales pitch. Only
  // relative paths are honoured, so this cannot be used to bounce someone off
  // the site.
  const requested = String(formData.get("next") ?? "");
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (err) {
    // next-auth signals a successful redirect by throwing; only a genuine
    // AuthError means the credentials were wrong.
    if (err instanceof AuthError) {
      return { error: "Email or password is incorrect" };
    }
    throw err;
  }
}

export async function logout() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
  redirect("/");
}
