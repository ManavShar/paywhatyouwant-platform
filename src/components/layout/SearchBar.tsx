"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBar({
  className,
  size = "md",
  autoFocus = false,
  placeholder = "Search photos, music, ebooks, podcasts…",
}: {
  className?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className={cn("relative w-full", className)}
    >
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle",
          size === "lg" ? "h-5 w-5" : "h-4 w-4",
        )}
      />
      <input
        type="search"
        name="q"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className={cn(
          "w-full rounded-full border border-hairline bg-surface pr-4 text-ink",
          "placeholder:text-ink-subtle",
          "transition-colors focus:border-transparent focus:bg-canvas",
          size === "lg" ? "h-14 pl-12 text-base" : "h-11 pl-10 text-[0.9375rem]",
        )}
      />
    </form>
  );
}
