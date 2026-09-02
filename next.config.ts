import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nothing gained by announcing the framework and version to a scanner.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      /**
       * Server Action request bodies are capped at 1MB by default, and every
       * upload on this site goes through one. The form promised 500MB while
       * the framework was rejecting anything over a megabyte *before*
       * `createProduct` ran — so none of its friendly error messages could
       * ever fire and a normal photograph failed with a generic error.
       *
       * 50MB rather than 500: `storeUpload` reads the whole file into memory
       * (`src/lib/storage.ts`), so the ceiling here is really a statement
       * about heap. Anything larger needs a streaming route handler instead.
       * `MAX_UPLOAD_BYTES` is set to 48MB so a rejection comes back as our
       * message, with room left for multipart boundary overhead.
       */
      bodySizeLimit: "50mb",
      /**
       * Actions compare Origin against Host to block CSRF. Behind the
       * Cloudflare quick tunnel used for client previews those differ, and
       * every action — sign in, upload, follow — would be rejected.
       */
      allowedOrigins: ["*.trycloudflare.com"],
    },
  },

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
