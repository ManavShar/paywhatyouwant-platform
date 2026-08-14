import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Sign in' };

export default function Page() {
  return <ComingSoon title={'Sign in'} note={'Accounts arrive with the authentication phase. The catalogue is fully browsable without one.'} />;
}
