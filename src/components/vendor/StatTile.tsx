/**
 * A single number with its label.
 *
 * Deliberately flat: no coloured top border, no watermark icon behind the
 * value. The old dashboard gave each tile a different accent colour, which
 * implied a categorisation that did not exist and made the numbers harder to
 * compare at a glance.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-hairline p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums text-ink">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}
