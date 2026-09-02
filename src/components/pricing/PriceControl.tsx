"use client";

import { useMemo, useState, useId } from "react";
import {
  formatPrice,
  parsePriceToCents,
  formatAmountForInput,
  cn,
} from "@/lib/utils";

/**
 * The one component this entire platform rests on.
 *
 * Principles, in priority order:
 *
 *  1. The suggested price arrives PRE-FILLED. Anchoring is what makes
 *     pay-what-you-want commercially viable rather than charitable — the
 *     research Max cites is consistent on this. An empty box collapses
 *     revenue.
 *
 *  2. Zero is a first-class choice and is never shamed. No guilt copy, no
 *     "are you sure?", no pre-ticked tip, no dark patterns. The model only
 *     works if the generosity is real, which requires the refusal to be real.
 *
 *  3. The creator is named. "Pay Rita Hills what you think it's worth" asks
 *     something quite different from "enter amount".
 *
 *  4. Fully operable by keyboard and screen reader. This is the checkout; it
 *     is not somewhere accessibility can be bolted on later.
 */
export function PriceControl({
  suggestedPriceCents,
  minimumPriceCents = 0,
  creatorName,
  onSubmit,
  submitting = false,
}: {
  suggestedPriceCents: number;
  minimumPriceCents?: number;
  creatorName: string;
  onSubmit: (cents: number) => void;
  submitting?: boolean;
}) {
  const inputId = useId();
  const errorId = useId();

  const [cents, setCents] = useState(
    Math.max(suggestedPriceCents, minimumPriceCents),
  );
  const [raw, setRaw] = useState(() =>
    formatAmountForInput(Math.max(suggestedPriceCents, minimumPriceCents)),
  );
  const [touched, setTouched] = useState(false);

  /**
   * Preset chips bracket the suggestion rather than sitting below it, so the
   * suggested amount does not read as the ceiling. Always includes a genuine
   * free option when the creator permits one.
   */
  const presets = useMemo(
    () => buildPresets(suggestedPriceCents, minimumPriceCents),
    [suggestedPriceCents, minimumPriceCents],
  );

  const belowMinimum = cents < minimumPriceCents;
  const invalid = touched && belowMinimum;

  function setAmount(next: number) {
    setCents(next);
    setRaw(formatAmountForInput(next));
    setTouched(true);
  }

  function handleTyped(value: string) {
    setRaw(value);
    setTouched(true);
    const parsed = parsePriceToCents(value);
    // Guard on null, not falsiness — 0 is a valid amount here.
    if (parsed !== null) setCents(parsed);
    else if (value.trim() === "") setCents(0);
  }

  return (
    <div className="rounded-card border border-hairline bg-canvas p-5">
      <p className="text-[0.9375rem] font-semibold text-ink">
        Pay {creatorName} what you think it&apos;s worth
      </p>
      {suggestedPriceCents > 0 && (
        <p className="mt-1 text-sm text-ink-muted">
          They suggest {formatPrice(suggestedPriceCents)}. Anything is welcome.
        </p>
      )}

      <div
        role="group"
        aria-label="Choose an amount"
        className="mt-4 flex flex-wrap gap-2"
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            aria-pressed={cents === p}
            className={cn(
              "h-10 min-w-[4rem] rounded-control border px-3 text-sm font-semibold transition-colors",
              cents === p
                ? "border-brand bg-brand text-ink-inverse"
                : "border-hairline-strong text-ink hover:bg-surface-hover",
            )}
          >
            {p === 0 ? "Free" : formatPrice(p)}
            {p === suggestedPriceCents && p !== 0 && (
              <span className="ml-1 text-[0.6875rem] font-medium opacity-70">
                suggested
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-ink-muted"
        >
          Or enter your own
        </label>
        <div
          className={cn(
            "mt-1.5 flex h-12 items-center rounded-control border bg-canvas px-3",
            "focus-within:border-brand",
            invalid ? "border-danger" : "border-hairline-strong",
          )}
        >
          <span aria-hidden className="mr-1 text-lg font-semibold text-ink-subtle">
            $
          </span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={(e) => handleTyped(e.target.value)}
            onBlur={() => setRaw(formatAmountForInput(cents))}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className="h-full w-full bg-transparent text-lg font-semibold text-ink outline-none"
          />
        </div>

        {invalid && (
          <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
            This creator asks for at least {formatPrice(minimumPriceCents)}.
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={submitting || belowMinimum}
        onClick={() => onSubmit(cents)}
        className={cn(
          "mt-5 h-12 w-full rounded-control bg-brand text-base font-semibold text-ink-inverse",
          "transition-colors hover:bg-brand-hover disabled:opacity-50",
        )}
      >
        {submitting
          ? "One moment…"
          : cents === 0
            ? "Download for free"
            : `Pay ${formatPrice(cents)}`}
      </button>

      {/* Stated plainly, once, without pressure. People who cannot pay should
          not have to feel watched deciding not to. */}
      {cents === 0 && minimumPriceCents === 0 && (
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-subtle">
          Free is a real choice here. Take it, enjoy it, and come back another
          time.
        </p>
      )}
    </div>
  );
}

/**
 * Presets bracket the suggestion: something below it, the suggestion itself,
 * and two above. Only amounts at or above the creator's minimum survive, and
 * free is offered whenever the minimum allows it.
 */
function buildPresets(suggested: number, minimum: number): number[] {
  const candidates = new Set<number>();

  if (minimum === 0) candidates.add(0);

  if (suggested > 0) {
    candidates.add(suggested);
    candidates.add(roundNicely(suggested * 0.5));
    candidates.add(roundNicely(suggested * 2));
    candidates.add(roundNicely(suggested * 4));
  } else {
    // No suggestion from the creator: offer a conventional ladder.
    for (const c of [100, 300, 500, 1000]) candidates.add(c);
  }

  return [...candidates]
    .filter((c) => c >= minimum)
    .sort((a, b) => a - b)
    .slice(0, 5);
}

/** Rounds to a price that looks chosen rather than computed. */
function roundNicely(cents: number): number {
  if (cents < 100) return Math.max(50, Math.round(cents / 50) * 50);
  if (cents < 1000) return Math.round(cents / 100) * 100;
  return Math.round(cents / 500) * 500;
}
