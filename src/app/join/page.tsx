import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AuthForm } from "@/components/auth/AuthForm";
import { register } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage() {
  // Checked against the database, not the token. Deciding this from the JWT
  // while the dashboard checks the database meant a deleted account bounced
  // between the two forever: sign-in said "you're logged in, go to the
  // dashboard", the dashboard said "you don't exist, go sign in".
  if (await requireUser()) redirect("/dashboard");

  return (
    <>
      <SiteHeader showSearch={false} />
      <main className="mx-auto w-full max-w-sm px-4 py-16 sm:py-24">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Join Paywhatyouwant.io
        </h1>
        <p className="mb-8 mt-2 text-[0.9375rem] text-ink-muted">
          Put your work up and let people decide what it&apos;s worth.
        </p>
        <Suspense fallback={<div className="h-96" />}>
          <AuthForm mode="join" action={register} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
