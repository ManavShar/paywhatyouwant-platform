"use server";

import { z } from "zod";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { limit, clientIp } from "@/lib/rate-limit";
import { sendMail, basicHtml, siteUrl, isMailConfigured } from "@/lib/mail";
import { createEmailToken } from "@/lib/receipts";

/**
 * "I bought something and lost the link."
 *
 * Guest checkout is deliberate — buying must not require an account — but it
 * left people with no way back to what they had paid for. This is that way
 * back, and it has to prove control of the address before it hands anything
 * over: a page that simply listed purchases for a typed-in email would be a
 * lookup tool for other people's downloads.
 */

export type RecoverState = { sent?: boolean; error?: string } | undefined;

const schema = z.object({ email: z.string().email("Enter a valid email address") });

export async function requestRecovery(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  }

  const email = parsed.data.email.toLowerCase();

  // Two counters. Per address stops this being used to bombard someone else's
  // inbox; per address alone would let one machine walk a list, so the caller
  // is limited too.
  const [byEmail, byIp] = await Promise.all([
    limit("emailSend", email),
    limit("emailSend", await clientIp()),
  ]);
  if (!byEmail.ok || !byIp.ok) {
    return {
      error: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  const hasPurchases = await db.order.count({
    where: { email, status: OrderStatus.COMPLETED },
  });

  // Only send when there is something to recover — but say the same thing
  // either way. Whether an address has bought anything here is not ours to
  // confirm to whoever types it in.
  if (hasPurchases > 0) {
    const token = await createEmailToken(email, "recover");
    const link = `${siteUrl()}/recover/${token}`;

    await sendMail({
      to: email,
      subject: "Your purchases on Paywhatyouwant.io",
      text: [
        "Someone asked to recover the downloads bought with this email address.",
        "",
        `Open this link to see them and get fresh download links: ${link}`,
        "",
        "The link works once and expires in an hour.",
        "If this wasn't you, ignore this email — nothing has changed.",
      ].join("\n"),
      html: basicHtml("Your purchases", [
        "Someone asked to recover the downloads bought with this email address.",
        `<a href="${link}" style="color:#1f6f5c;font-weight:600">See your purchases</a>`,
        "The link works once and expires in an hour.",
        "If this wasn't you, ignore this email — nothing has changed.",
      ]),
    });
  }

  // A deployment with no SMTP configured writes to `storage/outbox` instead of
  // sending. Saying so here is better than a confident "check your inbox" that
  // will never come true.
  if (!isMailConfigured()) {
    return {
      sent: true,
      error:
        "Email is not configured on this deployment yet, so the link was written to the server outbox rather than sent.",
    };
  }

  return { sent: true };
}
