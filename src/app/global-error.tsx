"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#0f172a",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <div
            style={{
              width: "3rem",
              height: "3rem",
              margin: "0 auto 1.5rem",
              borderRadius: "50%",
              backgroundColor: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              margin: "0 0 0.5rem",
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: "0.875rem",
              color: "#64748b",
              margin: "0 0 2rem",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. Please try again.
          </p>

          <button
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: "0.5rem",
              backgroundColor: "#0f172a",
              color: "#f8fafc",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.625rem 1.5rem",
              cursor: "pointer",
              transition: "background-color 150ms",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#1e293b";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#0f172a";
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#94a3b8",
                marginTop: "1.5rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
