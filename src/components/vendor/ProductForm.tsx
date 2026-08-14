"use client";

import { useActionState, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { Category, Licence } from "@prisma/client";
import { CATEGORIES, LICENCES } from "@/lib/taxonomy";
import { formatBytes, formatPrice, parsePriceToCents, cn } from "@/lib/utils";
import { createProduct, type ProductFormState } from "@/lib/actions/products";

const TITLE_MAX = 50;

/**
 * The upload form, following the field list Max supplied in his screenshots:
 * name, description, feature image, category, tags, product file + recommended
 * price, preview file, licence, and save-draft / submit.
 *
 * Two departures from the original, both deliberate:
 *  - The suggested price sits directly beneath a live preview of what the
 *    buyer will see. On this platform that number is the single most important
 *    decision a vendor makes, and the old form rendered it as an anonymous
 *    "Amount ($)" box with no indication of how it would be presented.
 *  - Files are drag-and-droppable and report their size immediately, rather
 *    than being pasted in as a "File URL".
 */
export function ProductForm() {
  const [state, formAction, pending] = useActionState<ProductFormState, FormData>(
    createProduct,
    undefined,
  );

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("2.99");
  const [category, setCategory] = useState<Category>(Category.PHOTOGRAPHY);

  const priceCents = parsePriceToCents(price);

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      <Section title="The basics">
        <Labelled
          label="Name"
          hint={`${title.length}/${TITLE_MAX} characters`}
          required
        >
          <input
            name="title"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunrise over the Sydney Opera House"
            className={inputClass}
          />
        </Labelled>

        <Labelled
          label="Description"
          hint="Shown on the product page, and used for search — be descriptive."
          required
        >
          <textarea
            name="description"
            required
            rows={6}
            placeholder="What is it, how was it made, what can people use it for?"
            className={cn(inputClass, "h-auto resize-y py-3 leading-relaxed")}
          />
        </Labelled>

        <div className="grid gap-4 sm:grid-cols-2">
          <Labelled label="Category" required>
            <select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Labelled>

          <Labelled label="Tags" hint="Comma separated">
            <input
              name="tags"
              placeholder="landscape, sunrise, australia"
              className={inputClass}
            />
          </Labelled>
        </div>
      </Section>

      <Section title="Files">
        <FileField
          name="productFile"
          label="The file people are buying"
          hint="Upload the original, at full quality. For an album or a set, zip it."
        />
        <FileField
          name="coverImage"
          label="Cover image"
          hint="Shown in the catalogue and on your page."
          accept="image/*"
        />
        <FileField
          name="previewFile"
          label="Preview"
          hint="A short clip or a lower-resolution taste. This is what plays inside embeds on other people's sites, so it does the selling."
        />
      </Section>

      <Section title="Price">
        <Labelled
          label="Suggested price"
          hint="Buyers see this pre-filled. They can pay more, less, or nothing."
          required
        >
          <div className="flex h-12 items-center rounded-control border border-hairline-strong bg-canvas px-3 focus-within:border-brand">
            <span aria-hidden className="mr-1 text-lg font-semibold text-ink-subtle">
              $
            </span>
            <input
              name="suggestedPrice"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-full w-full bg-transparent text-lg font-semibold outline-none"
            />
          </div>
        </Labelled>

        {/* Showing the vendor exactly what the buyer will be shown. The
            suggestion is the anchor the whole model rests on, so it should not
            be set blind. */}
        <div className="rounded-card border border-hairline bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Buyers will see
          </p>
          <p className="mt-2 text-[0.9375rem] font-semibold text-ink">
            Pay you what you think it&apos;s worth
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {priceCents === null || priceCents === 0
              ? "No suggestion — they name any price, including nothing."
              : `They suggest ${formatPrice(priceCents)}. Anything is welcome.`}
          </p>
        </div>

        <Labelled
          label="Minimum"
          hint="Leave at 0 to allow free. Most creators do — it's the point of the site, and people pay anyway."
        >
          <div className="flex h-12 items-center rounded-control border border-hairline-strong bg-canvas px-3 focus-within:border-brand">
            <span aria-hidden className="mr-1 font-semibold text-ink-subtle">
              $
            </span>
            <input
              name="minimumPrice"
              inputMode="decimal"
              defaultValue="0"
              className="h-full w-full bg-transparent font-semibold outline-none"
            />
          </div>
        </Labelled>
      </Section>

      <Section title="Licence">
        <fieldset className="space-y-2">
          <legend className="sr-only">Choose a licence</legend>
          {(Object.keys(LICENCES) as Licence[]).map((key, i) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-hairline p-3.5 transition-colors hover:bg-surface-hover has-[:checked]:border-brand has-[:checked]:bg-surface"
            >
              <input
                type="radio"
                name="licence"
                value={key}
                defaultChecked={i === 0}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
              />
              <span className="text-sm leading-relaxed">
                <span className="block font-semibold text-ink">
                  {LICENCES[key].label}
                </span>
                <span className="block text-ink-muted">
                  {LICENCES[key].description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </Section>

      {state?.error && (
        <p
          role="alert"
          className="rounded-control border border-danger/30 bg-danger/5 p-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="h-12 rounded-control border border-hairline-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-hover disabled:opacity-50 sm:flex-1"
        >
          Save as draft
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending}
          className="h-12 rounded-control bg-brand px-5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50 sm:flex-[2]"
        >
          {pending ? "Uploading…" : "Publish"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "h-12 w-full rounded-control border border-hairline-strong bg-canvas px-3 text-[0.9375rem] text-ink outline-none focus:border-brand";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Labelled({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {hint && (
        <span className="mb-1.5 mt-0.5 block text-xs leading-relaxed text-ink-subtle">
          {hint}
        </span>
      )}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </label>
  );
}

/** File input with a drop zone and immediate feedback on what was picked. */
function FileField({
  name,
  label,
  hint,
  accept,
}: {
  name: string;
  label: string;
  hint?: string;
  accept?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = `file-${name}`;

  return (
    <div>
      <span className="text-sm font-semibold text-ink">{label}</span>
      {hint && (
        <span className="mb-1.5 mt-0.5 block text-xs leading-relaxed text-ink-subtle">
          {hint}
        </span>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (!dropped) return;
          // Assign to the real input so the file is part of the form submit.
          const input = document.getElementById(inputId) as HTMLInputElement;
          const dt = new DataTransfer();
          dt.items.add(dropped);
          input.files = dt.files;
          setFile(dropped);
        }}
        className={cn(
          "relative rounded-card border border-dashed p-4 transition-colors",
          dragging
            ? "border-brand bg-surface"
            : "border-hairline-strong hover:bg-surface-hover",
        )}
      >
        <input
          id={inputId}
          type="file"
          name={name}
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />

        {file ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {file.name}
              </p>
              <p className="text-xs text-ink-subtle">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const input = document.getElementById(inputId) as HTMLInputElement;
                input.value = "";
                setFile(null);
              }}
              aria-label={`Remove ${file.name}`}
              className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-ink-muted">
            <UploadCloud className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-sm">
              Drop a file here, or click to choose
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
