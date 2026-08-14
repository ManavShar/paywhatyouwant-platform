"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { signIn, hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export type FormState = { error?: string } | undefined;

const registerSchema = z.object({
  email: z.string().email("That doesn't look like an email address"),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .max(30, "At most 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Letters, numbers, hyphens and underscores only",
    ),
  password: z.string().min(8, "Use at least 8 characters"),
  isVendor: z.boolean(),
});

export async function register(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
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
  const next = String(formData.get("next") ?? "") || "/dashboard";

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
