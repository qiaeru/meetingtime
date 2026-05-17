import type { RequestHandler } from "express";

// Defensive HTTP response headers. Deliberately hand-rolled instead of Helmet:
// the set below is the subset that actually applies to a single-origin,
// in-memory app with no cross-origin embedding and no third-party network calls.
export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    // style-src 'unsafe-inline' is required for Shiki's per-token inline
    // styles (CSP2 has no nonce for style attributes); img-src https: lets
    // hosts embed images in the Markdown notes.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join("; "),
    );

    // HSTS only when the request actually arrived over HTTPS so plain-HTTP
    // LAN deployments aren't poisoned with a stale "use https only" pin.
    const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
    if (proto === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  };
}
