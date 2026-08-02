import { createFileRoute } from "@tanstack/react-router";
import thrnHtml from "../content/thrn.html?raw";

export const NONCE_PLACEHOLDER = "__CSP_NONCE__";

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Strict CSP: inline scripts only run when they carry the per-request nonce. */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function renderThrnDocument(nonce: string): string {
  return thrnHtml.replaceAll(NONCE_PLACEHOLDER, nonce);
}

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: () => {
        const nonce = createNonce();
        return new Response(renderThrnDocument(nonce), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "content-security-policy": buildCsp(nonce),
          },
        });
      },
    },
  },
});
