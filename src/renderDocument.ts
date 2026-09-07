import fs from "fs";
import path from "path";

export const NONCE_PLACEHOLDER = "__CSP_NONCE__";

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
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
    const rows = block.trim().split(/\\n/).map((r: string) => r.trim()).filter(Boolean);
    if (rows.length < 3) return match;
    const separator = /^\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?$/;
    if (!separator.test(rows[1])) return match;
    const cells = (row: string) => row.replace(/^\\|/,'').replace(/\\|$/,'').split('|').map((c: string) => c.trim());
    const headers = cells(rows[0]);
    const bodyRows = rows.slice(2).map(cells);
    const headHtml = headers.map((c: string) => '<th style="padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12);white-space:nowrap">' + c + '</th>').join('');
    const bodyHtml = bodyRows.map((row: string[]) => '<tr>' + row.map((c: string) => '<td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top">' + c + '</td>').join('') + '</tr>').join('');
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
}`;

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
</section>`;

  let patched = html;
  if (patched.includes("</style>")) patched = patched.replace("</style>", `${styles}</style>`);
  return patched.includes("<!-- HOW IT WORKS -->")
    ? patched.replace("<!-- HOW IT WORKS -->", `${section}\n<!-- HOW IT WORKS -->`)
    : patched;
}

function readPublicSupabaseConfig(): { url: string; key: string } {
  let url = process.env.VITE_SUPABASE_URL || "";
  let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      const raw = fs.readFileSync(envPath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const value = match[2].replace(/^["']|["']$/g, "");
        if (match[1] === "VITE_SUPABASE_URL" && !url) url = value;
        if (match[1] === "VITE_SUPABASE_PUBLISHABLE_KEY" && !key) key = value;
      }
    } catch {
      /* no .env available */
    }
  }
  return { url, key };
}

export function patchAuth(html: string): string {
  const { url: SB_URL, key: SB_KEY } = readPublicSupabaseConfig();
  const script = `<script nonce="${NONCE_PLACEHOLDER}">
(() => {
  const SB_URL = ${JSON.stringify(SB_URL)};
  const SB_KEY = ${JSON.stringify(SB_KEY)};
  const STORE = 'thrn.auth.session';

  const readSession = () => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.access_token) return null;
      return s;
    } catch (e) { return null; }
  };
  const writeSession = (s) => {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
  };
  const clearSession = () => { try { localStorage.removeItem(STORE); } catch (e) {} };

  const api = (pathname, body, method) => fetch(SB_URL + pathname, {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (res) => {
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || 'Something went wrong. Please try again.';
      throw new Error(String(msg));
    }
    return data;
  });

  const getUser = (token) => fetch(SB_URL + '/auth/v1/user', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token }
  }).then((res) => res.ok ? res.json() : null).catch(() => null);

  // Handle the OAuth redirect coming back with tokens in the URL hash.
  const consumeHashTokens = () => {
    const hash = window.location.hash || '';
    if (hash.indexOf('access_token=') === -1) return null;
    const params = new URLSearchParams(hash.slice(1));
    const session = {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_at: Number(params.get('expires_at') || 0)
    };
    if (!session.access_token) return null;
    writeSession(session);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return session;
  };

  const bootedInPopup = () => {
    const hash = window.location.hash || '';
    if (window.opener && window.opener !== window && hash.indexOf('access_token=') !== -1) {
      consumeHashTokens();
      try { window.opener.postMessage({ type: 'thrn-auth-success' }, window.location.origin); } catch (e) {}
      window.close();
      return true;
    }
    return false;
  };

  const boot = () => {
    if (window.__THRN_AUTH_BOOTED__) return;
    window.__THRN_AUTH_BOOTED__ = true;
    if (bootedInPopup()) return;
    consumeHashTokens();

    const style = document.createElement('style');
    style.textContent = '.thrn-auth-wrap{position:fixed;top:12px;right:40px;z-index:9999;font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.thrn-auth-profile{width:38px;height:38px;padding:0;border:1px solid rgba(124,158,122,.38);border-radius:50%;display:grid;place-items:center;background:rgba(17,19,24,.92);color:#dfe8dd;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(14px);transition:background .15s,border-color .15s,transform .12s;overflow:hidden}.thrn-auth-profile:hover{background:rgba(124,158,122,.14);border-color:rgba(124,158,122,.65);transform:translateY(-1px)}.thrn-auth-profile svg{width:19px;height:19px}.thrn-auth-profile img{width:100%;height:100%;object-fit:cover;border-radius:50%}.thrn-auth-menu{position:absolute;top:46px;right:0;width:268px;padding:10px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(17,19,24,.97);box-shadow:0 18px 50px rgba(0,0,0,.42);backdrop-filter:blur(18px);display:none}.thrn-auth-menu.open{display:block}.thrn-auth-title{padding:8px 10px 4px;color:#e4e9e2;font-size:14px}.thrn-auth-copy{padding:2px 10px 10px;color:#9ca39d;font-size:12px;line-height:1.45}.thrn-auth-signin,.thrn-auth-email,.thrn-auth-signout,.thrn-auth-submit{width:100%;border-radius:8px;padding:10px 12px;font:600 13px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.thrn-auth-signin{border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}.thrn-auth-email{margin-top:7px;border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}.thrn-auth-submit{margin-top:8px;border:1px solid rgba(124,158,122,.55);background:rgba(124,158,122,.16);color:#dfe8dd}.thrn-auth-signin:hover,.thrn-auth-email:hover,.thrn-auth-signout:hover,.thrn-auth-submit:hover{background:#111318;border-color:rgba(124,158,122,.5)}.thrn-auth-user{padding:8px 10px 10px;color:#a8c4a6;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thrn-auth-signout{border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2}.thrn-auth-field{width:100%;box-sizing:border-box;margin-top:7px;padding:9px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#090a0c;color:#e4e9e2;font:400 13px system-ui,sans-serif}.thrn-auth-field:focus{outline:none;border-color:rgba(124,158,122,.6)}.thrn-auth-msg{padding:8px 10px 2px;font-size:11.5px;line-height:1.45;color:#c9a4a4}.thrn-auth-msg.ok{color:#a8c4a6}.thrn-auth-alt{display:block;width:100%;margin-top:8px;background:none;border:none;color:#9ca39d;font-size:11.5px;text-align:center;cursor:pointer;text-decoration:underline}.thrn-auth-back{background:none;border:none;color:#9ca39d;font-size:11.5px;cursor:pointer;padding:6px 10px 0;text-decoration:underline}@media(max-width:700px){.thrn-auth-wrap{top:10px;right:14px}.thrn-auth-profile{width:36px;height:36px}.thrn-auth-menu{right:0;width:250px}}';
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'thrn-auth-wrap';

    const profile = document.createElement('button');
    profile.type = 'button';
    profile.className = 'thrn-auth-profile';
    profile.setAttribute('aria-label', 'Profile');
    profile.setAttribute('aria-expanded', 'false');
    const AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5"></path></svg>';
    profile.innerHTML = AVATAR_SVG;

    const menu = document.createElement('div');
    menu.className = 'thrn-auth-menu';

    const closeMenu = () => {
      menu.classList.remove('open');
      profile.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      menu.classList.add('open');
      profile.setAttribute('aria-expanded', 'true');
    };

    profile.addEventListener('click', (event) => {
      event.stopPropagation();
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });
    menu.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

    const signInWithGoogle = () => {
      const redirect = window.location.origin + window.location.pathname;
      const authorize = SB_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirect);
      const popup = window.open(authorize, 'thrn-google-signin', 'width=480,height=640,noopener=no');
      if (!popup) window.location.assign(authorize);
    };

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'thrn-auth-success') renderSignedIn();
    });

    function renderSignedOut(message, messageOk) {
      profile.innerHTML = AVATAR_SVG;
      menu.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'thrn-auth-title';
      title.textContent = 'Welcome to THRN';
      const copy = document.createElement('div');
      copy.className = 'thrn-auth-copy';
      copy.textContent = 'Your senior AI marketing consultant for growth, audits, and strategies.';
      menu.appendChild(title);
      menu.appendChild(copy);
      if (message) {
        const msg = document.createElement('div');
        msg.className = 'thrn-auth-msg' + (messageOk ? ' ok' : '');
        msg.textContent = message;
        menu.appendChild(msg);
      }
      const google = document.createElement('button');
      google.type = 'button';
      google.className = 'thrn-auth-signin';
      google.textContent = 'Sign in with Google';
      google.addEventListener('click', signInWithGoogle);
      const email = document.createElement('button');
      email.type = 'button';
      email.className = 'thrn-auth-email';
      email.textContent = 'Sign in with email';
      email.addEventListener('click', () => renderEmailForm('signin'));
      menu.appendChild(google);
      menu.appendChild(email);
    }

    function renderEmailForm(mode, message, messageOk) {
      menu.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'thrn-auth-title';
      title.textContent = mode === 'signup' ? 'Create your account' : 'Sign in with email';
      menu.appendChild(title);
      if (message) {
        const msg = document.createElement('div');
        msg.className = 'thrn-auth-msg' + (messageOk ? ' ok' : '');
        msg.textContent = message;
        menu.appendChild(msg);
      }
      const form = document.createElement('form');
      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.required = true;
      emailInput.autocomplete = 'email';
      emailInput.className = 'thrn-auth-field';
      emailInput.placeholder = 'you@company.com';
      const passInput = document.createElement('input');
      passInput.type = 'password';
      passInput.required = true;
      passInput.minLength = 6;
      passInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      passInput.className = 'thrn-auth-field';
      passInput.placeholder = 'Password';
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'thrn-auth-submit';
      submit.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
      form.appendChild(emailInput);
      form.appendChild(passInput);
      form.appendChild(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Please wait…';
        const creds = { email: emailInput.value.trim(), password: passInput.value };
        const request = mode === 'signup'
          ? api('/auth/v1/signup?redirect_to=' + encodeURIComponent(window.location.origin), creds)
          : api('/auth/v1/token?grant_type=password', creds);
        request.then((data) => {
          if (data && data.access_token) {
            writeSession(data);
            renderSignedIn();
            closeMenu();
            return;
          }
          renderEmailForm('signin', 'Check your inbox to confirm your email, then sign in.', true);
        }).catch((error) => {
          renderEmailForm(mode, error && error.message ? error.message : 'Could not sign you in.', false);
        });
      });
      menu.appendChild(form);
      const alt = document.createElement('button');
      alt.type = 'button';
      alt.className = 'thrn-auth-alt';
      alt.textContent = mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account';
      alt.addEventListener('click', () => renderEmailForm(mode === 'signup' ? 'signin' : 'signup'));
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'thrn-auth-back';
      back.textContent = 'Back';
      back.addEventListener('click', () => renderSignedOut());
      menu.appendChild(alt);
      menu.appendChild(back);
      setTimeout(() => emailInput.focus(), 30);
    }

    function renderSignedIn() {
      const session = readSession();
      if (!session) { renderSignedOut(); return; }
      menu.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'thrn-auth-title';
      title.textContent = 'Your THRN account';
      const who = document.createElement('div');
      who.className = 'thrn-auth-user';
      who.textContent = 'Signed in';
      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'thrn-auth-signout';
      out.textContent = 'Sign out';
      out.addEventListener('click', () => {
        fetch(SB_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: SB_KEY, Authorization: 'Bearer ' + session.access_token }
        }).catch(() => {}).then(() => {
          clearSession();
          renderSignedOut('You have been signed out.', true);
        });
      });
      menu.appendChild(title);
      menu.appendChild(who);
      menu.appendChild(out);
      document.body.classList.add('thrn-signed-in');
      const gate = document.getElementById('auth-gate');
      if (gate) gate.classList.remove('show');
      getUser(session.access_token).then((user) => {
        if (!user) { clearSession(); renderSignedOut('Your session expired. Please sign in again.'); return; }
        const meta = user.user_metadata || {};
        who.textContent = meta.full_name || meta.name || user.email || 'Signed in';
        if (meta.avatar_url) {
          const img = document.createElement('img');
          img.src = meta.avatar_url;
          img.alt = '';
          profile.innerHTML = '';
          profile.appendChild(img);
        }
      });
    }

    wrap.appendChild(profile);
    wrap.appendChild(menu);
    document.body.appendChild(wrap);

    if (readSession()) renderSignedIn(); else renderSignedOut();

    // Any in-page "Continue with Google" link uses the same flow.
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('a[href="/auth/google"], [data-action="signin-google"]') : null;
      if (!target) return;
      event.preventDefault();
      signInWithGoogle();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
</script>`;

  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
}

export function renderThrnDocument(nonce: string = ""): string {
  const filePath = path.resolve(process.cwd(), "src/content/thrn.html");
  let rawHtml = "";
  if (fs.existsSync(filePath)) {
    rawHtml = fs.readFileSync(filePath, "utf-8");
  } else {
    rawHtml = `<!DOCTYPE html><html><head><title>THRN</title></head><body><h1>THRN AI Marketing Consultant</h1></body></html>`;
  }
  const patched = patchSynapse(patchChatMarkdownRenderer(rawHtml));
  const authed = patchAuth(patched);
  return nonce ? authed.replaceAll(NONCE_PLACEHOLDER, nonce) : authed.replaceAll(NONCE_PLACEHOLDER, "thrn-static");
}
