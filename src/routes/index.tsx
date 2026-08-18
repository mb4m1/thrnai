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

export function patchChatMarkdownRenderer(html: string): string {
  const needle = "  // Headers\n  text = text.replace(/^## (.+)$/gm, '<h4>$1</h4>');";
  const replacement = `  // Mobile/Markdown compatibility: model output may contain escaped <br> tags.
  text = text.replace(/&lt;br\\s*\\/?&gt;/gi, '<br>');
  text = text.replace(/^[\\-•]\\s+/gm, '');
  text = text.replace(/^---+\\s*$/gm, '');
  text = text.replace(/^([1-9])️⃣\\s+(.+)$/gm, '<h5>$2</h5>');
  text = text.replace(/(^|[\\s(])\\*([^*\\n]+)\\*(?=[\\s).,!?:;]|$)/g, '$1<strong>$2</strong>');
  text = text.replace(/<p([^>]*)>/gi, '<p$1 style="white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%;">');
  text = text.replace(/<li([^>]*)>/gi, '<li$1 style="white-space:normal;overflow-wrap:anywhere;word-break:break-word;max-width:100%;">');
  text = text.replace(/<div([^>]*)>/gi, '<div$1 style="max-width:100%;overflow-wrap:anywhere;word-break:break-word;">');
  text = text.replace(/\\n?Follow-ups?:[\\s\\S]*$/i, '');
  text = text.replace(/(?:^|\\n)((?:\\|[^\\n]*\\|?\\n){3,})/g, (match, block) => {
    const rows = block.trim().split(/\\n/).map(r => r.trim()).filter(Boolean);
    if (rows.length < 3) return match;
    const separator = /^\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?$/;
    if (!separator.test(rows[1])) return match;
    const cells = (row) => row.replace(/^\\|/,'').replace(/\\|$/,'').split('|').map(c => c.trim());
    const headers = cells(rows[0]);
    const bodyRows = rows.slice(2).map(cells);
    const headHtml = headers.map(c => '<th style="padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12);white-space:nowrap">' + c + '</th>').join('');
    const bodyHtml = bodyRows.map(row => '<tr>' + row.map(c => '<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top">' + c + '</td>').join('') + '</tr>').join('');
    return '<div style="max-width:100%;overflow-x:auto;margin:10px 0;-webkit-overflow-scrolling:touch"><table style="width:max-content;min-width:100%;border-collapse:collapse;font-size:.92em"><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>';
  });
  text = text.replace(/^### (.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^## (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^# (.+)$/gm, '<h3>$1</h3>');`;
  return html.includes(needle) ? html.replace(needle, replacement) : html;
}

/**
 * Mark the page as the Cloudflare/Workers-backed THRN runtime.
 * The shipped HTML already contains the sign-in button, auth gate, and
 * /auth/me integration; it intentionally stays disabled on static previews.
 * This small bootstrap flag activates that existing UI on the deployed Worker.
 */
export function patchAuth(html: string): string {
  const script = `<script nonce="${NONCE_PLACEHOLDER}">window.__THRN_PROXY__ = true;</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
}

export function renderThrnDocument(nonce: string): string {
  const patched = patchChatMarkdownRenderer(thrnHtml);
  return patchAuth(patched).replaceAll(NONCE_PLACEHOLDER, nonce);
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
