import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: "Terms & conditions" };

/**
 * Held back deliberately. A full draft was written and then withdrawn until a
 * solicitor has read it — publishing terms nobody qualified has checked is
 * worse than admitting they are not ready, because people rely on them.
 */
export default function Page() {
  return (
    <ComingSoon
      title="Terms & conditions"
      note="The terms are being prepared and reviewed. Until they are published, email info@paywhatyouwant.io with any question about how the marketplace works."
    />
  );
}
