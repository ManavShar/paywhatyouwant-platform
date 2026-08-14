import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Join Paywhatyouwant.io' };

export default function Page() {
  return <ComingSoon title={'Join Paywhatyouwant.io'} note={'Registration arrives with the authentication phase, together with creator onboarding.'} />;
}
