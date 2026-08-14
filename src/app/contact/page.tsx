import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const metadata: Metadata = { title: 'Contact' };

export default function Page() {
  return <ComingSoon title={'Contact'} note={'Until the contact form is built, email info@paywhatyouwant.io.'} />;
}
