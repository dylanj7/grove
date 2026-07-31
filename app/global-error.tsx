"use client";

import { useEffect } from "react";

// The last resort: the root layout itself failed, so there is no shell, no
// theme tokens, and no fonts to render into — this component replaces <html>
// entirely. That is why it is styled inline and says almost nothing: anything
// it depends on is, by definition, the thing that might be broken.
//
// Grove's palette can't be used here (globals.css may not have loaded), so the
// colours are hard-coded to the light-mode ground and deepest text, with a
// prefers-color-scheme swap for the evening — because an 11pm white flash is
// hostile even in a failure state, and especially in one.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("root failed:", error.digest ?? "", error);
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
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f8f4",
          color: "#12241a",
        }}
      >
        <style>{`@media (prefers-color-scheme: dark){body{background:#0e1511 !important;color:#e9f2eb !important}}`}</style>
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.3rem", lineHeight: 1.4, margin: 0 }}>
            Grove couldn&rsquo;t start.
          </p>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, opacity: 0.75, marginTop: "0.9rem" }}>
            Nothing you&rsquo;ve set down is affected. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.6rem",
              minHeight: 48,
              padding: "0 1.5rem",
              borderRadius: 16,
              border: 0,
              background: "#43614c",
              color: "#f6f8f4",
              fontSize: "0.74rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
