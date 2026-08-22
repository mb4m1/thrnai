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
 * Activate the deployed Worker authentication UI.
 *
 * The marketing page is intentionally served as static HTML. Authentication
 * is therefore mounted here at the Worker boundary rather than by the React
 * login route. The API already rejects unauthenticated chat requests; this
 * bootstrap makes that requirement visible and sends users through the real
 * Google OAuth endpoint instead of leaving them with a hidden/non-functional
 * sign-in control.
 */
export function patchAuth(html: string): string {
  const script = `<script nonce="${NONCE_PLACEHOLDER}">
(() => {
  const boot = () => {
    if (window.__THRN_AUTH_BOOTED__) return;
    window.__THRN_AUTH_BOOTED__ = true;

    const style = document.createElement('style');
    style.textContent = '.thrn-auth-wrap{position:fixed;top:12px;right:40px;z-index:9999;font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.thrn-auth-profile{width:38px;height:38px;padding:0;border:1px solid rgba(124,158,122,.38);border-radius:50%;display:grid;place-items:center;background:rgba(17,19,24,.92);color:#dfe8dd;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(14px);transition:background .15s,border-color .15s,transform .12s}.thrn-auth-profile:hover{background:rgba(124,158,122,.14);border-color:rgba(124,158,122,.65);transform:translateY(-1px)}.thrn-auth-profile svg{width:19px;height:19px}.thrn-auth-menu{position:absolute;top:46px;right:0;width:240px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(17,19,24,.97);box-shadow:0 18px 50px rgba(0,0,0,.42);backdrop-filter:blur(18px);display:none}.thrn-auth-menu.open{display:block}.thrn-auth-title{padding:8px 10px 4px;color:#e4e9e2;font-size:14px}.thrn-auth-copy{padding:2px 10px 10px;color:#9ca39d;font-size:12px;line-height:1.45}.thrn-auth-signin,.thrn-auth-email,.thrn-auth-signout{width:100%;border-radius:8px;padding:10px 12px;font:600 13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.thrn-auth-signin{border:0;background:#7c9e7a;color:#111510}.thrn-auth-email{margin-top:7px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#dfe8dd}.thrn-auth-signin:hover,.thrn-auth-email:hover,.thrn-auth-signout:hover{filter:brightness(1.06)}.thrn-auth-user{padding:8px 10px 10px;color:#a8c4a6;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thrn-auth-signout{border:0;background:#7c9e7a;color:#111510}@media(max-width:700px){.thrn-auth-wrap{top:10px;right:14px}.thrn-auth-profile{width:36px;height:36px}.thrn-auth-menu{right:0;width:220px}}';
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'thrn-auth-wrap';

    const profile = document.createElement('button');
    profile.type = 'button';
    profile.className = 'thrn-auth-profile';
    profile.setAttribute('aria-label', 'Profile');
    profile.setAttribute('aria-expanded', 'false');
    profile.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5"></path></svg>';

    const menu = document.createElement('div');
    menu.className = 'thrn-auth-menu';
    menu.innerHTML = '<div class="thrn-auth-title">Welcome to THRN</div><div class="thrn-auth-copy">Sign in to sync your chats and get the full THRN experience.</div><button type="button" class="thrn-auth-signin">Sign in with Google</button><button type="button" class="thrn-auth-email">Sign in with email</button>';

    const closeMenu = () => {
      menu.classList.remove('open');
      profile.setAttribute('aria-expanded', 'false');
    };

    profile.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = menu.classList.toggle('open');
      profile.setAttribute('aria-expanded', String(open));
    });

    menu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    const googleSignin = menu.querySelector('.thrn-auth-signin');
    googleSignin.addEventListener('click', () => { window.location.assign('/auth/google'); });

    const emailSignin = menu.querySelector('.thrn-auth-email');
    emailSignin.addEventListener('click', () => { window.location.assign('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); });

    wrap.appendChild(profile);
    wrap.appendChild(menu);
    document.body.appendChild(wrap);

    const replaceAuthCopy = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      for (const textNode of nodes) {
        const value = textNode.nodeValue || '';
        if (/NO ACCOUNT NEEDED/i.test(value)) {
          textNode.nodeValue = value.replace(/NO ACCOUNT NEEDED/gi, 'SIGN IN REQUIRED');
        }
      }
    };
    replaceAuthCopy();

    fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data && data.authenticated) {
          menu.innerHTML = '<div class="thrn-auth-title">Your THRN account</div><div class="thrn-auth-user">' + (data.user?.name ? String(data.user.name).replace(/[<>]/g, '') : 'Signed in') + '</div><button type="button" class="thrn-auth-signout">Sign out</button>';
          menu.querySelector('.thrn-auth-signout').addEventListener('click', () => { window.location.assign('/auth/logout'); });
        }
      })
      .catch(() => {});

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const requestUrl = typeof input === 'string' ? input : (input && 'url' in input ? input.url : '');
      if (response.status === 401 && String(requestUrl).includes('/api/chat')) {
        window.location.assign('/auth/google');
      }
      return response;
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
</script>`;
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
