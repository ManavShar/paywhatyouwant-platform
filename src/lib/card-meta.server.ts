import { cookies } from "next/headers";
import {
  CARD_META_COOKIE,
  DEFAULT_CARD_META,
  parseCardMeta,
  type CardMeta,
} from "./card-meta";

/**
 * The URL wins so the switch takes effect on the page you typed it on; the
 * cookie carries the choice from there, so clicking into a product and back
 * does not silently revert it. `CardMetaSync` writes that cookie.
 */
export async function resolveCardMeta(
  param?: string | string[],
): Promise<CardMeta> {
  const fromUrl = parseCardMeta(Array.isArray(param) ? param[0] : param);
  if (fromUrl) return fromUrl;

  const cookieStore = await cookies();
  return parseCardMeta(cookieStore.get(CARD_META_COOKIE)?.value) ?? DEFAULT_CARD_META;
}
