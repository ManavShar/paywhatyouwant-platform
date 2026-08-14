"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/lib/actions/profile";

type Initial = {
  name: string | null;
  bio: string | null;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  username: string;
};

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    undefined,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <Field
        label="Display name"
        name="name"
        defaultValue={initial.name ?? ""}
        placeholder={initial.username}
        hint="What buyers see on your work. Your URL stays /vendor/{username}."
      />

      <label className="block">
        <span className="text-sm font-semibold text-ink">Bio</span>
        <span className="mb-1.5 mt-0.5 block text-xs text-ink-subtle">
          A few lines about you and what you make.
        </span>
        <textarea
          name="bio"
          rows={4}
          defaultValue={initial.bio ?? ""}
          className="w-full resize-y rounded-control border border-hairline-strong bg-canvas p-3 text-[0.9375rem] leading-relaxed outline-none focus:border-brand"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Profile picture</span>
        <input
          type="file"
          name="avatar"
          accept="image/*"
          className="mt-1.5 block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border file:border-hairline-strong file:bg-canvas file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-hover"
        />
      </label>

      <Field
        label="Website"
        name="website"
        type="url"
        defaultValue={initial.website ?? ""}
        placeholder="https://"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Twitter / X"
          name="twitter"
          defaultValue={initial.twitter ?? ""}
          placeholder="username"
        />
        <Field
          label="Instagram"
          name="instagram"
          defaultValue={initial.instagram ?? ""}
          placeholder="username"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm font-medium text-success">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-control bg-brand px-6 text-sm font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
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
      {hint && (
        <span className="mb-1.5 mt-0.5 block text-xs text-ink-subtle">{hint}</span>
      )}
      <input
        {...props}
        className="mt-1.5 h-12 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] outline-none focus:border-brand"
      />
    </label>
  );
}
