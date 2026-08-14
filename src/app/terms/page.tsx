import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Terms & conditions' };

export default function Page() {
  return <ComingSoon title={'Terms & conditions'} note={'The terms are being rewritten for the new platform.'} />;
}
