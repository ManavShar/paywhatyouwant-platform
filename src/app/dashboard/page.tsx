import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Vendor dashboard' };

export default function Page() {
  return <ComingSoon title={'Vendor dashboard'} note={'The creator dashboard - uploads, earnings over time, orders - arrives in the vendor phase.'} />;
}
