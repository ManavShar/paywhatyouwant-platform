"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import type { FormState } from "@/lib/actions/auth";

/**
 * Shared shell for sign-in and registration.
 *
 * Uses `useActionState` so validation errors come back from the server action
 * without any client-side fetch, and the form still works before hydration.
 */
export function AuthForm({
  mode,
  action,
}: {
  mode: "signin" | "join";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const params = useSearchParams();
  const next = params.get("next") ?? "";

  const isJoin = mode === "join";

  return (
    <form action={formAction} className="space-y-4">
      {!isJoin && <input type="hidden" name="next" value={next} />}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />

      {isJoin && (
        <Field
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          required
          hint="This becomes your public page: paywhatyouwant.io/vendor/yourname"
        />
      )}

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isJoin ? "new-password" : "current-password"}
        required
        hint={isJoin ? "At least 8 characters" : undefined}
      />

      {isJoin && (
        <label className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-4">
          <input
            type="checkbox"
            name="isVendor"
            defaultChecked
            className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          />
          <span className="text-sm leading-relaxed">
            <span className="font-semibold text-ink">
              I want to sell my work
            </span>
            <span className="block text-ink-muted">
              Gives you a creator page and the dashboard. You can browse and buy
              either way.
            </span>
          </span>
        </label>
      )}

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-control bg-brand text-base font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
      >
        {pending
          ? "One moment…"
          : isJoin
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="pt-2 text-center text-sm text-ink-muted">
        {isJoin ? (
          <>
            Already have an account?{" "}
            <Link href="/signin" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/join" className="font-semibold text-brand hover:underline">
              Join
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        className="mt-1.5 h-12 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
      />
      {hint && <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>}
    </label>
  );
}
