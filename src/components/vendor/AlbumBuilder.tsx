"use client";

import { useActionState, useRef, useState } from "react";
import { Category, Licence } from "@prisma/client";
import { GripVertical, X, ArrowUp, ArrowDown } from "lucide-react";
import { createAlbum, type AlbumFormState } from "@/lib/actions/albums";
import { CATEGORIES, LICENCES } from "@/lib/taxonomy";
import { MAX_STREAM_UPLOAD_BYTES, MAX_STREAM_UPLOAD_LABEL } from "@/lib/upload-limits";
import { cn, formatBytes } from "@/lib/utils";

/**
 * Builds an album by uploading its files one at a time.
 *
 * This is the reason `/api/upload` exists. Every other form on the site posts
 * through a Server Action, whose body is capped at 48MB because the file is
 * read into memory — and a ten-track album is roughly 78MB, a twenty-photo set
 * roughly 50MB. No amount of tuning that cap makes a collection fit in one
 * request, so the files go up individually, streamed to disk, and only the
 * resulting keys are submitted to the action.
 *
 * The practical benefit is that a failure part-way through costs one file
 * rather than the whole upload, and the creator can see which one.
 */

type Uploaded = {
  storageKey: string;
  token: string;
  fileName: string;
  sizeBytes: number;
  extension: string | null;
  mimeType: string | null;
  publicUrl: string | null;
};

type Row = {
  /** Stable across reordering — `key` cannot be the array index. */
  id: string;
  file: File;
  title: string;
  price: string;
  progress: number;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
  uploaded?: Uploaded;
};

/**
 * Uploads one file, reporting progress.
 *
 * `XMLHttpRequest` rather than `fetch`, purely for `upload.onprogress` —
 * fetch still cannot report how much of a request body has been sent, and on
 * a 50MB album a progress bar is the difference between waiting and assuming
 * it has hung.
 */
function uploadOne(
  file: File,
  role: "product" | "cover",
  onProgress: (pct: number) => void,
): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/upload?role=${role}&name=${encodeURIComponent(file.name)}`,
    );
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("The server sent back something unreadable."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as Uploaded);
      } else {
        reject(new Error((body as { error?: string })?.error ?? "Upload failed."));
      }
    };

    xhr.onerror = () => reject(new Error("The connection dropped."));
    xhr.send(file);
  });
}

/**
 * Turns `03_last-light.jpg` into `Last Light`.
 *
 * Three things, in order: drop the extension, drop a leading track number
 * (the running order is stored separately and the album page numbers the list
 * itself, so repeating it in the title reads as clutter), and capitalise.
 * Words already carrying capitals are left alone, so `DSC_0041` and `McKenzie`
 * survive intact.
 */
function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d{1,3}\s*[-_. ]+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!base) return name;

  return base
    .split(" ")
    .map((word) =>
      /[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

let rowSeq = 0;

export function AlbumBuilder() {
  const [state, dispatch, pending] = useActionState<AlbumFormState, FormData>(
    createAlbum,
    undefined,
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [coverProgress, setCoverProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Row[] = [];
    for (const file of Array.from(list)) {
      rowSeq += 1;
      next.push({
        id: `row-${rowSeq}`,
        file,
        // A filename is a decent first guess at a title and a terrible final
        // one, so it is pre-filled and editable rather than used as-is.
        title: titleFromFileName(file.name),
        price: "",
        progress: 0,
        status: file.size > MAX_STREAM_UPLOAD_BYTES ? "error" : "waiting",
        error:
          file.size > MAX_STREAM_UPLOAD_BYTES
            ? `${formatBytes(file.size)} — over the ${MAX_STREAM_UPLOAD_LABEL} limit`
            : undefined,
      });
    }
    setRows((r) => [...r, ...next]);
  }

  function patch(id: string, change: Partial<Row>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  function move(index: number, delta: number) {
    setRows((r) => {
      const to = index + delta;
      if (to < 0 || to >= r.length) return r;
      const copy = [...r];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  }

  async function submit(intent: "draft" | "publish") {
    setLocalError(null);

    const form = formRef.current;
    if (!form) return;

    if (rows.length === 0) {
      setLocalError("Add the files that go in this album first.");
      return;
    }
    if (rows.some((r) => r.status === "error")) {
      setLocalError("Remove or replace the files that failed before saving.");
      return;
    }
    if (rows.some((r) => !r.title.trim())) {
      setLocalError("Every item needs a title.");
      return;
    }

    setBusy(true);
    try {
      // Cover first: it is small, and if it fails there is no point spending
      // ten minutes uploading audio.
      let uploadedCover: Uploaded | null = null;
      if (cover) {
        setCoverProgress(0);
        uploadedCover = await uploadOne(cover, "cover", setCoverProgress);
        setCoverProgress(100);
      }

      // Sequential, not parallel. Ten simultaneous 8MB uploads compete for the
      // same connection, finish no sooner, and make the progress meaningless.
      const done: (Row & { uploaded: Uploaded })[] = [];
      for (const row of rows) {
        if (row.uploaded) {
          done.push(row as Row & { uploaded: Uploaded });
          continue;
        }
        patch(row.id, { status: "uploading", progress: 0 });
        try {
          const uploaded = await uploadOne(row.file, "product", (pct) =>
            patch(row.id, { progress: pct }),
          );
          patch(row.id, { status: "done", progress: 100, uploaded });
          done.push({ ...row, uploaded });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          patch(row.id, { status: "error", error: message });
          setLocalError(
            `${row.file.name} didn't upload — ${message} Everything else was kept, so you can retry just this one.`,
          );
          return;
        }
      }

      const data = new FormData(form);
      data.set("intent", intent);
      data.set(
        "payload",
        JSON.stringify({
          cover: uploadedCover,
          tracks: done.map((r) => ({
            ...r.uploaded,
            title: r.title.trim(),
            price: r.price.trim(),
          })),
        }),
      );

      dispatch(data);
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
  const error = localError ?? state?.error;

  return (
    <form ref={formRef} className="max-w-3xl space-y-8">
      {/* ---- the album itself ------------------------------------- */}
      <section className="space-y-5">
        <Field label="Album title" hint="What the collection is called.">
          <input name="title" required maxLength={80} className={inputClass} />
        </Field>

        <Field
          label="Description"
          hint="Shown on the album page, and it's what search reads."
        >
          <textarea
            name="description"
            required
            rows={4}
            className={cn(inputClass, "h-auto py-3")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category">
            <select name="category" className={inputClass} defaultValue={Category.MUSIC}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cover image" hint="Optional, but it is what people see.">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              className={fileClass}
            />
            {coverProgress !== null && <Progress value={coverProgress} />}
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Suggested price for the whole album"
            hint="The anchor buyers see first. 0 is allowed."
          >
            <input
              name="suggestedPrice"
              defaultValue="0"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>

          <Field label="Minimum" hint="Leave at 0 to allow free.">
            <input
              name="minimumPrice"
              defaultValue="0"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
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
                  defaultChecked={value === Licence.ALL_RIGHTS_RESERVED}
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
      </section>

      {/* ---- what goes in it -------------------------------------- */}
      <section>
        <h2 className="text-sm font-semibold text-ink">What&apos;s in the album</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Add every track or photograph. Each one becomes an item people can
          also buy on its own — up to {MAX_STREAM_UPLOAD_LABEL} per file.
        </p>

        <input
          type="file"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className={cn(fileClass, "mt-3")}
        />

        {rows.length > 0 && (
          <ol className="mt-4 divide-y divide-hairline rounded-card border border-hairline">
            {rows.map((row, index) => (
              <li key={row.id} className="p-3">
                <div className="flex items-start gap-3">
                  <GripVertical
                    aria-hidden
                    className="mt-2.5 h-4 w-4 shrink-0 text-ink-subtle"
                  />
                  <span className="mt-2.5 w-5 shrink-0 text-sm tabular-nums text-ink-subtle">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={row.title}
                      onChange={(e) => patch(row.id, { title: e.target.value })}
                      placeholder="Title"
                      className={cn(inputClass, "h-10")}
                    />
                    <p className="truncate text-xs text-ink-subtle">
                      {row.file.name} · {formatBytes(row.file.size)}
                    </p>
                    {row.status === "uploading" && <Progress value={row.progress} />}
                    {row.error && (
                      <p className="text-xs text-danger">{row.error}</p>
                    )}
                  </div>

                  <div className="w-28 shrink-0">
                    <input
                      value={row.price}
                      onChange={(e) => patch(row.id, { price: e.target.value })}
                      placeholder="On its own"
                      inputMode="decimal"
                      className={cn(inputClass, "h-10")}
                      aria-label={`Price for ${row.title || row.file.name} on its own`}
                    />
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className={iconClass}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      className={iconClass}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((r) => r.filter((x) => x.id !== row.id))
                      }
                      className={cn(iconClass, "hover:text-danger")}
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {rows.length > 0 && (
          <p className="mt-2 text-xs text-ink-subtle">
            Leave a price blank and we&apos;ll set one that makes the album the
            better deal. Total to upload:{" "}
            {formatBytes(rows.reduce((sum, r) => sum + r.file.size, 0))}.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => submit("publish")}
          disabled={working}
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
        >
          {working ? "Uploading…" : "Publish album"}
        </button>
        <button
          type="button"
          onClick={() => submit("draft")}
          disabled={working}
          className="inline-flex h-11 items-center rounded-control border border-hairline-strong px-5 text-sm font-semibold text-ink hover:bg-surface-hover disabled:opacity-50"
        >
          Save as draft
        </button>
      </div>
    </form>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-brand transition-[width] duration-150"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-ink-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-brand";

const fileClass =
  "block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface-hover file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink";

const iconClass =
  "rounded p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-30";
