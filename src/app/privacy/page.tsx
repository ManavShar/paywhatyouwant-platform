import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Page() {
  return <ComingSoon title={'Privacy policy'} note={'The privacy policy is being rewritten for the new platform.'} />;
}
