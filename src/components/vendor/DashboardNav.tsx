"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  UserRound,
  MessageSquare,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/actions/auth";

/**
 * The old site's dashboard used a dark navy sidebar that fought every product
 * image on the page. This keeps the same white canvas as the rest of the site
 * and lets the work stay the loudest thing on screen.
 *
 * On phones the sidebar becomes a horizontally scrolling tab strip rather than
 * a hamburger — a vendor checking earnings on their phone should not need two
 * taps to reach the thing they opened the app for.
 */
const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/dashboard/products/new", label: "Add product", icon: Plus },
  { href: "/dashboard/posts", label: "Updates", icon: MessageSquare },
  { href: "/dashboard/earnings", label: "Earnings", icon: TrendingUp },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

export function DashboardNav({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <nav className="lg:w-56 lg:shrink-0">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-surface-hover text-ink"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <hr className="my-3 hidden border-hairline lg:block" />

      <div className="hidden lg:block">
        <Link
          href={`/vendor/${username}`}
          className="flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          View public page
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
