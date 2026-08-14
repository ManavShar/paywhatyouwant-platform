"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createPost, type PostState } from "@/lib/actions/social";
import { formatBytes } from "@/lib/utils";

const MAX = 2000;

/**
 * Composer for a vendor update.
 *
 * Clearing after a successful post is done by remounting the fields — the
 * action returns a fresh `token`, which is used as a React key. The obvious
 * alternative, an effect that calls setState when the action reports success,
 * causes a cascading render and is what `react-hooks/set-state-in-effect`
 * exists to catch. Remounting also clears the file input, which resetting
 * state alone would not.
 */
export function PostComposer() {
  const [state, formAction, pending] = useActionState<PostState, FormData>(
    createPost,
    undefined,
  );

  return (
    <form action={formAction} className="rounded-card border border-hairline p-4">
      <ComposerFields
        key={state?.token ?? 0}
        pending={pending}
        error={state?.error}
      />
    </form>
  );
}

function ComposerFields({
  pending,
  error,
}: {
  pending: boolean;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);

  return (
    <>
      <label htmlFor="post-body" className="sr-only">
        What are you working on?
      </label>
      <textarea
        id="post-body"
        name="body"
        rows={3}
        maxLength={MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What are you working on? Followers will see this."
        className="w-full resize-y bg-transparent text-[0.9375rem] leading-relaxed outline-none placeholder:text-ink-subtle"
      />

      {image && (
        <div className="mt-2 flex items-center gap-2 rounded-control bg-surface p-2">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {image.name} · {formatBytes(image.size)}
          </span>
          <button
            type="button"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = "";
              setImage(null);
            }}
            aria-label="Remove image"
            className="grid h-7 w-7 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ImagePlus className="h-4 w-4" aria-hidden />
          Image
          <input
            ref={fileRef}
            type="file"
            name="image"
            accept="image/*"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>

        <span
          className={
            body.length > MAX - 100
              ? "ml-auto text-xs tabular-nums text-warning"
              : "ml-auto text-xs tabular-nums text-ink-subtle"
          }
        >
          {body.length}/{MAX}
        </span>

        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="h-10 rounded-control bg-brand px-4 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </>
  );
}
