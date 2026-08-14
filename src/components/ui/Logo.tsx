import { cn } from "@/lib/utils";

/* The logo is strategically load-bearing. Max's brief: it "becomes like the
   soundcloud logo, but where people can click to pay something" — it is the
   core branding on every embed placed on someone else's site.

   Drawn as inline SVG rather than shipped as a raster so it stays crisp at
   any size, needs no network request inside an embed, and can be recoloured
   for dark host pages. The gradient IDs are suffixed to avoid collisions when
   dark host pages.

   The gradient uses one fixed ID rather than a generated one. A counter or
   useId would differ between server and client render and break hydration;
   every instance paints the identical gradient, so browsers resolving all
   references to the first definition is exactly the behaviour we want. */

const GRADIENT_ID = "pwyw-mark-gradient";

export function LogoMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="64" x2="64" y2="0">
          <stop offset="0%" stopColor="var(--color-brand-green)" />
          <stop offset="100%" stopColor="var(--color-brand-blue)" />
        </linearGradient>
      </defs>
      {/* Droplet: rounded on three corners, square at the bottom-left. */}
      <path
        d="M8 32 A24 24 0 0 1 32 8 A24 24 0 0 1 56 32 A24 24 0 0 1 32 56 L8 56 Z"
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth="9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  showTagline = false,
  compact = false,
}: {
  className?: string;
  showTagline?: boolean;
  /** Mark only — used in tight embed headers and on small screens. */
  compact?: boolean;
}) {
  if (compact) {
    return <LogoMark className={className} title="Paywhatyouwant.io" />;
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8 shrink-0" title="Paywhatyouwant.io" />
      {/* Hairline divider, matching the printed logo. */}
      <span aria-hidden className="h-7 w-px bg-hairline-strong" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.0625rem] font-extrabold tracking-tight text-ink">
          Paywhatyouwant<span className="text-ink-muted">.io</span>
        </span>
        {showTagline && (
          <span className="mt-1 text-[0.6875rem] font-normal text-ink-subtle">
            music, ebooks, photography and more…
          </span>
        )}
      </span>
    </span>
  );
}
