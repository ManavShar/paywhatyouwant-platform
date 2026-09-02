"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CARD_META_COOKIE } from "@/lib/card-meta";

/**
 * Remembers `?cards=` so the choice survives navigation.
 *
 * Rendered once from the header, which is on every page, so the parameter can
 * be appended anywhere and sticks from then on. A plain document.cookie write
 * rather than a server action: this is a display preference for one reviewer,
 * not state worth a round trip.
 */
export function CardMetaSync() {
  const value = useSearchParams().get(CARD_META_COOKIE);

  useEffect(() => {
    if (value !== "always" && value !== "hover") return;
    document.cookie = `${CARD_META_COOKIE}=${value};path=/;max-age=2592000;samesite=lax`;
  }, [value]);

  return null;
}
