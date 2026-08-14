import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AuthForm } from "@/components/auth/AuthForm";
import { login } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Checked against the database, not the token. Deciding this from the JWT
  // while the dashboard checks the database meant a deleted account bounced
  // between the two forever: sign-in said "you're logged in, go to the
  // dashboard", the dashboard said "you don't exist, go sign in".
  if (await requireUser()) redirect("/dashboard");

  return (
    <>
      <SiteHeader showSearch={false} />
      <main className="mx-auto w-full max-w-sm px-4 py-16 sm:py-24">
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mb-8 mt-2 text-[0.9375rem] text-ink-muted">
          Sign in to manage your work and see what you&apos;ve earned.
        </p>
        <Suspense fallback={<div className="h-80" />}>
          <AuthForm mode="signin" action={login} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
