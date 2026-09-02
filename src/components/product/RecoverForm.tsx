"use client";

import { useActionState } from "react";
import { requestRecovery, type RecoverState } from "@/lib/actions/recover";

export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(
    requestRecovery,
    undefined,
  );

  // The success message is deliberately the same whether or not that address
  // has ever bought anything. Confirming which addresses are customers is not
  // ours to do for whoever happens to be typing.
  if (state?.sent) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-5">
        <p className="font-semibold text-ink">Check your email</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          If we have purchases for that address, a link is on its way. It works
          once and expires in an hour.
        </p>
        {state.error && (
          <p className="mt-3 text-sm leading-relaxed text-warning">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-ink">Email address</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1.5 h-11 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send me the link"}
      </button>
    </form>
  );
}
