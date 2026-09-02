"use server";

import { redirect } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth";
import { createGrant } from "@/lib/downloads";

export type ReissueState = { error?: string } | undefined;

/**
 * Issues a fresh download link for something already bought.
 *
 * A grant lasts thirty days and ten downloads, which is right for a link that
 * can be forwarded to anyone — but it means a buyer who comes back in a year,
 * or who lost a download to a dropped connection, has a receipt and no file.
 * The schema anticipated this ("re-issuable from the buyer's library"); this
 * is the library half of that promise.
 *
 * Entitlement is re-derived from the completed order every time. Nothing about
 * the old grant is trusted, and nothing the browser sends decides who owns it.
 */
export async function reissueGrant(
  _prev: ReissueState,
  formData: FormData,
): Promise<ReissueState> {
  const user = await requireUser();
  if (!user) redirect("/signin?next=/purchases");

  // Each reissue writes a grant row, so this is the one place a signed-in
  // buyer could quietly generate unbounded records.
  const gate = await limit("reissue", user.id);
  if (!gate.ok) {
    return { error: "Too many new links in a short time. Try again shortly." };
  }

  const orderId = String(formData.get("orderId") ?? "");
  const productId = String(formData.get("productId") ?? "");

  const order = await db.order.findFirst({
    where: {
      id: orderId,
      buyerId: user.id,
      status: OrderStatus.COMPLETED,
      items: { some: { productId } },
    },
    select: { id: true },
  });

  if (!order) {
    return { error: "We can't find that purchase on your account." };
  }

  const grant = await createGrant({
    productId,
    orderId: order.id,
    userId: user.id,
    email: user.email,
  });

  redirect(`/download/${grant.token}`);
}
