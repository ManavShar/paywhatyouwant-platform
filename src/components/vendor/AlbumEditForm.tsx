"use client";

import { useActionState, useRef, useState } from "react";
import { Category, Licence } from "@prisma/client";
import { updateAlbum, type AlbumFormState } from "@/lib/actions/albums";
import { CATEGORIES, LICENCES } from "@/lib/taxonomy";
import { cn, formatAmountForInput } from "@/lib/utils";

/**
 * Edits an album's own fields. Its contents are edited item by item.
 *
 * The cover goes through `/api/upload` rather than the form body, for the same
 * reason the builder does: one code path for uploads, and no dependence on the
 * Server Action body limit.
 */
export function AlbumEditForm({
  album,
}: {
  album: {
    id: string;
    title: string;
    description: string;
    category: Category;
    licence: Licence;
    suggestedPriceCents: number;
    minimumPriceCents: number;
    coverImageUrl: string | null;
  };
}) {
  const [state, dispatch, pending] = useActionState<AlbumFormState, FormData>(
    updateAlbum,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    const form = formRef.current;
    if (!form) return;
    setLocalError(null);
    setBusy(true);

    try {
      const data = new FormData(form);

      if (cover) {
        const res = await fetch(
          `/api/upload?role=cover&name=${encodeURIComponent(cover.name)}`,
          {
            method: "POST",
            headers: { "Content-Type": cover.type || "application/octet-stream" },
            body: cover,
          },
        );
        const body = await res.json();
        if (!res.ok) {
          setLocalError(body.error ?? "That cover didn't upload.");
          return;
        }
        data.set("cover", JSON.stringify(body));
      }

      dispatch(data);
    } catch {
      setLocalError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  const error = localError ?? state?.error;

  return (
    <form ref={formRef} className="max-w-3xl space-y-5">
      <input type="hidden" name="albumId" value={album.id} />

      <label className="block">
        <span className="text-sm font-semibold text-ink">Album title</span>
        <input
          name="title"
          required
          maxLength={80}
          defaultValue={album.title}
          className={cn(inputClass, "mt-1.5")}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Description</span>
        <textarea
          name="description"
          required
          rows={4}
          defaultValue={album.description}
          className={cn(inputClass, "mt-1.5 h-auto py-3")}
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Category</span>
          <select
            name="category"
            defaultValue={album.category}
            className={cn(inputClass, "mt-1.5")}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Cover image</span>
          <span className="mt-0.5 block text-sm text-ink-muted">
            {album.coverImageUrl
              ? "Choose a file to replace it, or leave this empty to keep it."
              : "Optional, but it is what people see."}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCover(e.target.files?.[0] ?? null)}
            className={cn(fileClass, "mt-1.5")}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-ink">
            Suggested price for the album
          </span>
          <input
            name="suggestedPrice"
            inputMode="decimal"
            defaultValue={formatAmountForInput(album.suggestedPriceCents)}
            className={cn(inputClass, "mt-1.5")}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Minimum</span>
          <input
            name="minimumPrice"
            inputMode="decimal"
            defaultValue={formatAmountForInput(album.minimumPriceCents)}
            className={cn(inputClass, "mt-1.5")}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">Licence</legend>
        <div className="mt-2 space-y-2">
          {Object.entries(LICENCES).map(([value, meta]) => (
            <label key={value} className="flex items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="licence"
                value={value}
                defaultChecked={value === album.licence}
                className="mt-1"
              />
              <span>
                <span className="font-semibold text-ink">{meta.label}</span>
                <span className="block text-ink-muted">{meta.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={working}
        className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
      >
        {working ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-brand";

const fileClass =
  "block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface-hover file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink";
