"use client";

import { useState } from "react";
import { Check, Code2 } from "lucide-react";

/**
 * Copy-the-embed-code affordance.
 *
 * This sits on every product page because getting the widget onto other
 * people's sites is the growth mechanism, not a side feature — the logo
 * travelling with it is the point ("it becomes like the soundcloud logo, but
 * where people can click to pay something").
 */
export function EmbedCode({ productSlug }: { productSlug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  const snippet = `<iframe src="${siteUrl}/embed/${productSlug}" width="100%" height="180" frameborder="0" scrolling="no" style="border:0;border-radius:12px;max-width:640px" title="Pay what you want on Paywhatyouwant.io"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the textarea below is still selectable.
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
      >
        <Code2 className="h-4 w-4" aria-hidden />
        Embed this on your site
      </button>

      {open && (
        <div className="mt-3 rounded-card border border-hairline bg-surface p-3">
          <p className="mb-2 text-xs leading-relaxed text-ink-muted">
            Paste this into your blog. Visitors can play the preview and pay
            without leaving your page.
          </p>
          <textarea
            readOnly
            value={snippet}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-control border border-hairline bg-canvas p-2 font-mono text-[0.6875rem] leading-relaxed text-ink-muted"
          />
          <button
            type="button"
            onClick={copy}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-control bg-ink px-3 text-sm font-semibold text-ink-inverse"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Copied
              </>
            ) : (
              "Copy code"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
