import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AuthForm } from "@/components/auth/AuthForm";
import { login } from "@/lib/actions/auth";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await currentUser()) redirect("/dashboard");

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
