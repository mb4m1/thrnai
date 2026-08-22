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

export function patchSynapse(html: string): string {
  const styles = `
/* ── SYNAPSE ────────────────────────────────────────────────── */
.synapse-band { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 100px 40px; }
.synapse-inner { max-width: 1100px; margin: 0 auto; }
.synapse-head { max-width: 720px; margin-bottom: 52px; }
.synapse-mark { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--gold-text); margin-bottom: 16px; }
.synapse-mark::before { content: ''; width: 20px; height: 1px; background: var(--gold); }
.synapse-title { font-family: var(--serif); font-size: clamp(38px, 5vw, 64px); font-weight: 400; line-height: 1.04; letter-spacing: -.025em; color: var(--text); margin-bottom: 16px; }
.synapse-title em { color: var(--gold-text); font-style: italic; }
.synapse-intro { font-size: 16px; color: var(--text-2); line-height: 1.75; max-width: 650px; font-weight: 300; }
.synapse-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 42px; }
.synapse-card { position: relative; background: var(--base); padding: 30px 28px 32px; }
.synapse-card + .synapse-card { border-left: 1px solid var(--border); }
.synapse-num { font-family: var(--serif); font-size: 32px; color: var(--text-3); line-height: 1; margin-bottom: 22px; }
.synapse-name { font-family: var(--serif); font-size: 23px; color: var(--text); margin-bottom: 9px; }
.synapse-desc { font-size: 13.5px; color: var(--text-2); line-height: 1.7; font-weight: 300; }
.synapse-closer { border-top: 1px solid var(--border); padding-top: 28px; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
.synapse-closer-copy { max-width: 620px; }
.synapse-closer-title { font-family: var(--serif); font-size: 25px; color: var(--text); margin-bottom: 7px; }
.synapse-closer-title em { color: var(--gold-text); font-style: italic; }
.synapse-closer-text { font-size: 13.5px; color: var(--text-2); line-height: 1.7; font-weight: 300; }
.synapse-coming { flex-shrink: 0; padding: 8px 14px; border: 1px solid var(--gold-border); border-radius: 20px; color: var(--gold-text); background: var(--gold-dim); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
@media (max-width: 768px) {
  .synapse-band { padding: 80px 20px; }
  .synapse-grid { grid-template-columns: 1fr; }
  .synapse-card + .synapse-card { border-left: none; border-top: 1px solid var(--border); }
  .synapse-closer { align-items: flex-start; flex-direction: column; gap: 20px; }
}
`;

  const section = `
<!-- SYNAPSE -->
<section class="synapse-band" id="synapse">
  <div class="synapse-inner">
    <div class="synapse-head">
      <div class="synapse-mark">SYNAPSE™</div>
      <h2 class="synapse-title">The intelligence layer behind <em>AI visibility.</em></h2>
      <p class="synapse-intro">Your customers aren't only searching Google anymore. They're asking AI systems what to buy, who to trust, and which brands matter. SYNAPSE helps make sure your brand is understood in those conversations.</p>
    </div>

    <div class="synapse-grid">
      <div class="synapse-card">
        <div class="synapse-num">01</div>
        <div class="synapse-name">Understand</div>
        <p class="synapse-desc">Maps your brand, entity, audience, positioning, content and existing signals.</p>
      </div>
      <div class="synapse-card">
        <div class="synapse-num">02</div>
        <div class="synapse-name">Connect</div>
        <p class="synapse-desc">Identifies how those signals connect across search, content, authority and AI discovery.</p>
      </div>
      <div class="synapse-card">
        <div class="synapse-num">03</div>
        <div class="synapse-name">Optimize</div>
        <p class="synapse-desc">Turns the gaps into actionable AEO/AIO improvements designed to strengthen how AI systems discover, understand and surface your brand.</p>
      </div>
    </div>

    <div class="synapse-closer">
      <div class="synapse-closer-copy">
        <div class="synapse-closer-title">Built for the <em>next layer of discovery.</em></div>
        <p class="synapse-closer-text">Search gets you found. SYNAPSE helps AI understand why you matter.</p>
      </div>
      <div class="synapse-coming">Coming Soon</div>
    </div>
  </div>
</section>
`;

  let patched = html;
  if (patched.includes("</style>")) patched = patched.replace("</style>", `${styles}</style>`);
  return patched.includes("<!-- HOW IT WORKS -->")
    ? patched.replace("<!-- HOW IT WORKS -->", `${section}\n<!-- HOW IT WORKS -->`)
    : patched;
}

export function patchAuth(html: string): string {
  const script = `<script nonce="${NONCE_PLACEHOLDER}">
(() => {
  const boot = () => {
    if (window.__THRN_AUTH_BOOTED__) return;
    window.__THRN_AUTH_BOOTED__ = true;

    const style = document.createElement('style');
    style.textContent = '.thrn-auth-wrap{position:fixed;top:12px;right:40px;z-index:9999;font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.thrn-auth-profile{width:38px;height:38px;padding:0;border:1px solid rgba(124,158,122,.38);border-radius:50%;display:grid;place-items:center;background:rgba(17,19,24,.92);color:#dfe8dd;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(14px);transition:background .15s,border-color .15s,transform .12s}.thrn-auth-profile:hover{background:rgba(124,158,122,.14);border-color:rgba(124,158,122,.65);transform:translateY(-1px)}.thrn-auth-profile svg{width:19px;height:19px}.thrn-auth-menu{position:absolute;top:46px;right:0;width:240px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(17,19,24,.97);box-shadow:0 18px 50px rgba(0,0,0,.42);backdrop-filter:blur(18px);display:none}.thrn-auth-menu.open{display:block}.thrn-auth-title{padding:8px 10px 4px;color:#e4e9e2;font-size:14px}.thrn-auth-copy{padding:2px 10px 10px;color:#9ca39d;font-size:12px;line-height:1.45}.thrn-auth-signin,.thrn-auth-email,.thrn-auth-signout{width:100%;border-radius:8px;padding:10px 12px;font:600 13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.thrn-auth-signin{border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}.thrn-auth-email{margin-top:7px;border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}.thrn-auth-signin:hover,.thrn-auth-email:hover,.thrn-auth-signout:hover{background:#111318;border-color:rgba(124,158,122,.5)}.thrn-auth-user{padding:8px 10px 10px;color:#a8c4a6;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thrn-auth-signout{border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}@media(max-width:700px){.thrn-auth-wrap{top:10px;right:14px}.thrn-auth-profile{width:36px;height:36px}.thrn-auth-menu{right:0;width:220px}}';
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

    menu.querySelector('.thrn-auth-signin').addEventListener('click', () => { window.location.assign('/auth/google'); });
    menu.querySelector('.thrn-auth-email').addEventListener('click', () => { window.location.assign('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search)); });

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
        if (/NO ACCOUNT NEEDED/i.test(value)) textNode.nodeValue = value.replace(/NO ACCOUNT NEEDED/gi, 'SIGN IN REQUIRED');
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
      if (response.status === 401 && String(requestUrl).includes('/api/chat')) window.location.assign('/auth/google');
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
  const patched = patchSynapse(patchChatMarkdownRenderer(thrnHtml));
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
