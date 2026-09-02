"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export type HeaderUser = {
  name: string | null;
  username: string;
  role: string;
};

/**
 * Who you are, and the way out.
 *
 * Until now the only Sign out on the site lived in the creator dashboard
 * sidebar, so a signed-in buyer browsing the catalogue had no way to see their
 * own account or leave it. The menu also answers Max's complaint directly:
 * whatever else the header shows, a name in the corner is the unambiguous
 * signal that you are signed in.
 */
export function AccountMenu({
  user,
  className,
}: {
  user: HeaderUser;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = user.name || user.username;
  const isVendor = user.role !== "BUYER";

  // A dropdown that only closes on a second click on its own button strands
  // itself open the moment attention moves elsewhere.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-2 rounded-control py-1.5 pl-1.5 pr-2.5 text-sm font-semibold transition-colors",
          open ? "bg-surface-hover text-ink" : "text-ink-muted hover:bg-surface-hover hover:text-ink",
        )}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white"
        >
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[9rem] truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-card border border-hairline bg-canvas p-1.5 shadow-lifted">
          <p className="px-3 pb-1.5 pt-1 text-xs text-ink-subtle">
            Signed in as{" "}
            <span className="font-semibold text-ink-muted">{user.username}</span>
          </p>
          <hr className="mb-1.5 border-hairline" />

          <Link
            href={`/vendor/${user.username}`}
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
          >
            My page
          </Link>
          <Link
            href="/purchases"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
          >
            Purchases
          </Link>
          <Link
            href="/feed"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
          >
            Following
          </Link>
          {isVendor && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              Dashboard
            </Link>
          )}

          <hr className="my-1.5 border-hairline" />
          <SignOutButton className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface-hover">
            <LogOut aria-hidden className="h-4 w-4 text-ink-subtle" />
            Sign out
          </SignOutButton>
        </div>
      )}
    </div>
  );
}

/**
 * A form post rather than a click handler, so signing out works before
 * hydration and cannot be left half-done by a failed fetch — `logout` clears
 * the session cookie server-side and redirects.
 */
export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={logout}>
      <button type="submit" className={className}>
        {children ?? "Sign out"}
      </button>
    </form>
  );
}
