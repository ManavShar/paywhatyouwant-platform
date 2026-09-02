"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CATEGORIES, SHOW_CATALOGUE_COUNTS } from "@/lib/taxonomy";

/**
 * Filter chips plus a sort control.
 *
 * State lives entirely in the URL. That keeps filtered views shareable and
 * bookmarkable, lets the back button behave, and means the server component
 * below can render the results without any client-side data fetching.
 */
export function BrowseToolbar({
  total,
  showCategories = true,
}: {
  total: number;
  showCategories?: boolean;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const activeCategory = params.get("category");
  const freeOnly = params.get("free") === "1";
  const sort = params.get("sort") ?? "newest";

  function withParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete("page"); // any filter change returns to page one
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="sticky top-16 z-40 -mx-4 mb-6 border-b border-hairline bg-canvas/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {showCategories && (
          <>
            <Chip href={withParam("category", null)} active={!activeCategory}>
              All
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.slug}
                href={withParam("category", c.slug)}
                active={activeCategory === c.slug}
              >
                {c.label}
              </Chip>
            ))}
            <span aria-hidden className="h-5 w-px shrink-0 bg-hairline" />
          </>
        )}

        <Chip href={withParam("free", freeOnly ? null : "1")} active={freeOnly}>
          Free to take
        </Chip>

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          {SHOW_CATALOGUE_COUNTS && (
            <span className="hidden text-sm text-ink-subtle sm:inline">
              {total.toLocaleString()} items
            </span>
          )}
          <label className="sr-only" htmlFor="sort">
            Sort by
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => router.push(withParam("sort", e.target.value))}
            className="h-9 rounded-control border border-hairline-strong bg-canvas px-2 text-sm font-medium text-ink"
          >
            <option value="newest">Newest</option>
            <option value="popular">Most popular</option>
            <option value="price-low">Lowest suggested price</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-ink text-ink-inverse"
          : "border border-hairline-strong text-ink-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
