import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'How it works' };

export default function Page() {
  return <ComingSoon title={'How it works'} note={'A walkthrough for buyers and creators is being written.'} />;
}
