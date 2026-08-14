import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'The research behind pay what you want' };

export default function Page() {
  return <ComingSoon title={'The research behind pay what you want'} note={'A summary of the academic work on pay-what-you-want pricing, from Berkeley and elsewhere, is being written up here.'} />;
}
