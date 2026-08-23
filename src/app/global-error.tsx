"use client";

import { useEffect } from "react";

/**
 * §10.7's last resort: catches an error in the root layout itself, where
 * even `src/app/error.tsx` cannot help (it renders inside that layout).
 * Next.js requires this file to render its own complete <html>/<body> —
 * deliberately plain inline styles, not the shared component library,
 * since whatever broke may have been upstream of it.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f5f1",
          color: "#2b2b28",
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#6b6b64", marginBottom: "1.5rem" }}>
            TV Care could not load just now. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#4a6b57",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.9375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
