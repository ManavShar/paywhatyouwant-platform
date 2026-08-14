"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { Logo } from "@/components/ui/Logo";
import { SearchBar } from "./SearchBar";
import { CATEGORIES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

/**
 * Slim, sticky, and mostly out of the way — the catalogue is the point.
 *
 * Phone behaviour is not a shrunken desktop header: search collapses to an
 * icon that expands to a full-width field, and navigation moves into a sheet.
 * Both are primary targets, so both are designed rather than derived.
 */
export function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Paywhatyouwant.io home">
          <Logo className="hidden sm:inline-flex" />
          <Logo compact className="sm:hidden" />
        </Link>

        {showSearch && (
          <div className="hidden min-w-0 flex-1 md:block">
            {/* SearchBar reads useSearchParams, which opts a route out of
                static prerendering unless it sits behind a Suspense boundary.
                Wrapping it here rather than at each call site means every page
                that uses the header stays statically renderable. */}
            <Suspense fallback={<div className="mx-auto h-11 max-w-xl" />}>
              <SearchBar className="mx-auto max-w-xl" />
            </Suspense>
          </div>
        )}

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <CategoryMenu />
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-control px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/products/new"
                className="ml-1 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
              >
                Add product
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/sell"
                className="rounded-control px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Sell your work
              </Link>
              <Link
                href="/signin"
                className="rounded-control px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/join"
                className="ml-1 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
              >
                Join
              </Link>
            </>
          )}
        </nav>

        {/* Phone controls */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          {showSearch && (
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-expanded={searchOpen}
              className="grid h-11 w-11 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
            >
              {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="grid h-11 w-11 place-items-center rounded-control text-ink-muted hover:bg-surface-hover"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {searchOpen && showSearch && (
        <div className="border-t border-hairline px-4 py-3 md:hidden">
          <Suspense fallback={<div className="h-11" />}>
            <SearchBar autoFocus placeholder="Search…" />
          </Suspense>
        </div>
      )}

      {menuOpen && (
        <div className="border-t border-hairline bg-canvas px-4 py-3 md:hidden">
          <p className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-ink-subtle">
            Browse
          </p>
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              onClick={() => setMenuOpen(false)}
              className="block rounded-control px-2 py-3 text-[0.9375rem] font-medium hover:bg-surface-hover"
            >
              {c.label}
            </Link>
          ))}
          <hr className="my-2 border-hairline" />
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="block rounded-control px-2 py-3 text-[0.9375rem] font-medium hover:bg-surface-hover"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/products/new"
                onClick={() => setMenuOpen(false)}
                className="mt-2 block rounded-control bg-brand px-2 py-3 text-center text-[0.9375rem] font-semibold text-ink-inverse"
              >
                Add product
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/sell"
                onClick={() => setMenuOpen(false)}
                className="block rounded-control px-2 py-3 text-[0.9375rem] font-medium hover:bg-surface-hover"
              >
                Sell your work
              </Link>
              <Link
                href="/signin"
                onClick={() => setMenuOpen(false)}
                className="block rounded-control px-2 py-3 text-[0.9375rem] font-medium hover:bg-surface-hover"
              >
                Sign in
              </Link>
              <Link
                href="/join"
                onClick={() => setMenuOpen(false)}
                className="mt-2 block rounded-control bg-brand px-2 py-3 text-center text-[0.9375rem] font-semibold text-ink-inverse"
              >
                Join
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}

function CategoryMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "rounded-control px-3 py-2 text-sm font-semibold transition-colors",
          open ? "bg-surface-hover text-ink" : "text-ink-muted hover:bg-surface-hover hover:text-ink",
        )}
      >
        Browse
      </button>

      {open && (
        <div className="absolute right-0 top-full w-56 rounded-card border border-hairline bg-canvas p-1.5 shadow-lifted">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              {c.label}
            </Link>
          ))}
          <hr className="my-1.5 border-hairline" />
          <Link
            href="/browse"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm font-semibold text-brand hover:bg-surface-hover"
          >
            Everything
          </Link>
        </div>
      )}
    </div>
  );
}
