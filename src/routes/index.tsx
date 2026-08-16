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
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * The shipped THRN page has its renderer embedded in a single HTML document.
 * Keep the source page unchanged and apply this small compatibility patch at
 * the response boundary so Markdown tables and model-emitted <br> tags render
 * correctly on narrow/mobile screens too.
 */
export function patchChatMarkdownRenderer(html: string): string {
  const needle = "  // Headers\n  text = text.replace(/^## (.+)$/gm, '<h4>$1</h4>');";
  const replacement = `  // Mobile/Markdown compatibility: model output may contain escaped <br> tags.
  // Only allow the exact tag form (no attributes) so HTML safety is preserved.
  text = text.replace(/&lt;br\\s*\\/?&gt;/gi, '<br>');

  // Render standard Markdown tables inside a horizontally scrollable wrapper.
  // This keeps wide audit tables usable on phones instead of exposing raw | pipes.
  text = text.replace(/(?:^|\\n)(\\|[^\\n]+\\|\\n\\|(?:\\s*:?-+:?\\s*\\|)+\\n(?:\\|[^\\n]+\\|\\n?)+)/g, (_, block) => {
    const rows = block.trim().split(/\\n/).filter(Boolean);
    if (rows.length < 3) return block;
    const cells = (row) => row.trim().replace(/^\\|/,'').replace(/\\|$/,'').split('|').map(c => c.trim());
    const headers = cells(rows[0]);
    const bodyRows = rows.slice(2).map(cells);
    const headHtml = headers.map(c => \`<th style="padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12);white-space:nowrap">\${c}</th>\`).join('');
    const bodyHtml = bodyRows.map(row => \`<tr>\${row.map(c => \`<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top">\${c}</td>\`).join('')}</tr>\`).join('');
    return \`<div style="max-width:100%;overflow-x:auto;margin:10px 0;-webkit-overflow-scrolling:touch"><table style="width:max-content;min-width:100%;border-collapse:collapse;font-size:.92em"><thead><tr>\${headHtml}</tr></thead><tbody>\${bodyHtml}</tbody></table></div>\`;
  });

  // Headers
  text = text.replace(/^### (.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^## (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^# (.+)$/gm, '<h3>$1</h3>');`;

  return html.includes(needle) ? html.replace(needle, replacement) : html;
}

export function renderThrnDocument(nonce: string): string {
  const patched = patchChatMarkdownRenderer(thrnHtml);
  return patched.replaceAll(NONCE_PLACEHOLDER, nonce);
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
