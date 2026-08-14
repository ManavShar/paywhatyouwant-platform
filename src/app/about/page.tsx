import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'About' };

export default function Page() {
  return <ComingSoon title={'About'} note={'Paywhatyouwant.io was founded by Max Rangeley and is based in England.'} />;
}
