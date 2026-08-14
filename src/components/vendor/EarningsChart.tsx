import { formatMoney } from "@/lib/utils";

export type MonthlyEarning = { label: string; fullLabel: string; cents: number };

/**
 * Monthly earnings.
 *
 * Columns rather than an area: monthly totals are discrete buckets, and an
 * area would draw a slope between them implying earnings moved continuously
 * through the month, which is not something this data knows.
 *
 * One series, so no legend — the heading names it. A single flat hue for every
 * column, never a ramp: colouring bars darker-where-bigger would double-encode
 * the height and spend the only free channel on information already shown.
 *
 * The mark colour is #2E9E7E rather than the interface accent (#479286), which
 * fails the chroma floor and renders as grey when used as a data mark. This
 * value passes lightness, chroma and contrast against a white surface.
 *
 * Rendered as inline SVG in a server component: no chart library, no client
 * JS, and the hover affordance is pure CSS plus a <title> for screen readers.
 */
const SERIES = "#2E9E7E";

export function EarningsChart({ data }: { data: MonthlyEarning[] }) {
  const max = Math.max(...data.map((d) => d.cents), 0);

  if (max === 0) {
    return (
      <div className="grid h-56 place-items-center rounded-card border border-dashed border-hairline-strong text-center">
        <div>
          <p className="text-sm font-semibold text-ink">No earnings yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            This fills in as people buy your work.
          </p>
        </div>
      </div>
    );
  }

  // Geometry in a fixed viewBox; the SVG scales to its container.
  const W = 720;
  const H = 220;
  const PAD_L = 52;
  const PAD_B = 28;
  const PAD_T = 12;
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_B - PAD_T;

  const band = plotW / data.length;
  // Cap the bar and let the leftover be air, per the mark spec. The 2px
  // surface gap between neighbours comes out of the band, not the bar.
  const barW = Math.min(24, band - 8);

  const ticks = niceTicks(max, 3);
  const scaleY = (cents: number) => plotH * (1 - cents / ticks.top);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full"
        role="img"
        aria-label={`Monthly earnings. Highest month ${formatMoney(max)}.`}
      >
        {/* Gridlines: hairline, solid, recessive — never dashed. */}
        {ticks.values.map((v) => {
          const y = PAD_T + scaleY(v);
          return (
            <g key={v}>
              <line
                x1={PAD_L}
                x2={W - 8}
                y1={y}
                y2={y}
                stroke="var(--color-hairline)"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-[var(--color-ink-subtle)] text-[11px] tabular-nums"
              >
                {shortMoney(v)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const h = d.cents === 0 ? 0 : Math.max(2, plotH - scaleY(d.cents));
          const x = PAD_L + i * band + (band - barW) / 2;
          const y = PAD_T + plotH - h;
          const isPeak = d.cents === max;

          return (
            <g key={d.fullLabel} className="group">
              {/* Native tooltip — also what a screen reader announces. */}
              <title>{`${d.fullLabel}: ${formatMoney(d.cents)}`}</title>

              {/* Full-height hit target: the bar itself is too thin to hover
                  comfortably, especially on a short month. */}
              <rect
                x={PAD_L + i * band}
                y={PAD_T}
                width={band}
                height={plotH}
                fill="transparent"
              />

              {h > 0 && (
                <path
                  d={roundedTopBar(x, y, barW, h, 4)}
                  fill={SERIES}
                  className="transition-opacity group-hover:opacity-80"
                />
              )}

              {/* Direct-label the peak only. Labelling every column would make
                  all of them harder to read, not easier. */}
              {isPeak && h > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-[var(--color-ink)] text-[11px] font-semibold tabular-nums"
                >
                  {formatMoney(d.cents)}
                </text>
              )}

              <text
                x={PAD_L + i * band + band / 2}
                y={H - 8}
                textAnchor="middle"
                className="fill-[var(--color-ink-subtle)] text-[11px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={PAD_L}
          x2={W - 8}
          y1={PAD_T + plotH}
          y2={PAD_T + plotH}
          stroke="var(--color-hairline-strong)"
          strokeWidth="1"
        />
      </svg>
    </figure>
  );
}

/** Square at the baseline, 4px rounded at the data end. */
function roundedTopBar(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const radius = Math.min(r, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

/**
 * Axis ticks on clean round numbers rather than raw data maxima.
 *
 * The 1.15 factor reserves headroom above the tallest column. Without it a
 * peak that lands exactly on a round number reaches the top of the plot and
 * its direct label gets clipped against the edge.
 */
function niceTicks(maxCents: number, count: number) {
  const raw = (maxCents * 1.15) / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = Math.ceil(raw / mag) * mag;
  return {
    top: step * count,
    values: Array.from({ length: count + 1 }, (_, i) => i * step),
  };
}

function shortMoney(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
