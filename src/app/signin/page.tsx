import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AuthForm } from "@/components/auth/AuthForm";
import { login } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  const next = Array.isArray(sp.next) ? sp.next[0] : sp.next;

  // Checked against the database, not the token. Deciding this from the JWT
  // while the dashboard checks the database meant a deleted account bounced
  // between the two forever: sign-in said "you're logged in, go to the
  // dashboard", the dashboard said "you don't exist, go sign in".
  //
  // Someone already signed in goes where they were heading, not to the
  // dashboard — which for a buyer bounces on to the sales pitch, a strange
  // place to land after clicking a link to your own feed. Only relative paths
  // are honoured, so the parameter cannot be used to bounce someone off-site.
  if (await requireUser()) {
    redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

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
