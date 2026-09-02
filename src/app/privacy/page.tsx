import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * Held back for the same reason as the terms — see `src/app/terms/page.tsx`.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Privacy policy"
      note="The privacy policy is being prepared and reviewed. In the meantime: this site runs no analytics, advertising pixels or third-party trackers, and card details are handled by Stripe and never reach our servers. Email info@paywhatyouwant.io with any question."
    />
  );
}
