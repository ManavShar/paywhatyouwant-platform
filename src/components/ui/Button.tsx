import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 " +
  // 44px minimum touch target on the two larger sizes — phone is a primary
  // target, not an afterthought.
  "select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-ink-inverse hover:bg-brand-hover active:bg-brand-hover shadow-sm",
  secondary:
    "bg-canvas text-ink border border-hairline-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink",
  danger: "bg-danger text-ink-inverse hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[0.9375rem]",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}
