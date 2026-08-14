import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Geometric sans, chosen to sit naturally beside the rounded geometry of the
// logo mark. One family for everything — no secondary display face.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Paywhatyouwant.io — music, ebooks, photography and more",
    template: "%s · Paywhatyouwant.io",
  },
  description:
    "The world's first completely pay-what-you-want digital marketplace. Discover music, photography, podcasts, digital art and ebooks — then decide what to pay the creator.",
  openGraph: {
    type: "website",
    siteName: "Paywhatyouwant.io",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-dvh bg-canvas text-ink">{children}</body>
    </html>
  );
}
