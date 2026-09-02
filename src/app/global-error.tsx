"use client";

import { useEffect } from "react";

/**
 * The last resort: the root layout itself failed.
 *
 * This replaces the entire document, so it has to supply its own `<html>` and
 * `<body>` — and it cannot rely on the stylesheet, since a layout that threw
 * may never have loaded one. Everything here is inline for that reason. It
 * should be unreachable in practice; when it is reached, the site is
 * comprehensively broken and the only useful thing it can do is not be a blank
 * white screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#ffffff",
          color: "#1a1a1a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 12px", fontWeight: 800 }}>
            Paywhatyouwant.io is temporarily unavailable
          </h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.6, color: "#565656" }}>
            Something failed badly enough to take the whole page down. We have
            been told about it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: "44px",
              padding: "0 20px",
              border: 0,
              borderRadius: "8px",
              background: "#1f6f5c",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload the page
          </button>
          {error.digest && (
            <p style={{ marginTop: "24px", fontSize: "0.75rem", color: "#767676" }}>
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
