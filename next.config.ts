import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // `images.domains` is deprecated in Next 16 — remotePatterns only.
    remotePatterns: [
      {
        // Only needed while the migration is still pulling assets across.
        // Once media is local this can be dropped entirely.
        protocol: "https",
        hostname: "paywhatyouwant.io",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        // Default posture for the whole app: nobody frames us.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The deliberate exception. The embeddable widget only has value if
        // any blog can frame it, so this route opts out of the site-wide
        // frame ban. X-Frame-Options must be cleared (empty value) because it
        // has no "allow any origin" form and would otherwise override CSP.
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
