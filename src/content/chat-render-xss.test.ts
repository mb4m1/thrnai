import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Load the chat renderer straight out of the shipped page so these regression
// tests always exercise the exact code that runs in production.
const html = readFileSync(fileURLToPath(new URL("./thrn.html", import.meta.url)), "utf8");

function extract(name: string): string {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name}() not found in thrn.html`);
  let depth = 0;
  for (let i = html.indexOf("{", start); i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find end of ${name}()`);
}

const factory = new Function(
  `${extract("escapeHtml")}\n${extract("renderMarkdown")}\nreturn { escapeHtml, renderMarkdown };`,
) as () => {
  escapeHtml: (s: unknown) => string;
  renderMarkdown: (s: string) => string;
};

const { escapeHtml, renderMarkdown } = factory();

const PAYLOADS = [
  `<script>alert(1)</script>`,
  `<img src=x onerror=alert(1)>`,
  `<svg/onload=alert(1)>`,
  `<iframe src="javascript:alert(1)"></iframe>`,
  `"><script>alert(1)</script>`,
  `' onmouseover='alert(1)`,
  `<body onload=alert(1)>`,
  `<a href="javascript:alert(1)">click</a>`,
  `<style>*{background:url(javascript:alert(1))}</style>`,
  `<object data="data:text/html,<script>alert(1)</script>"></object>`,
  `&lt;script&gt;alert(1)&lt;/script&gt;`,
  `<!--<script>alert(1)</script>-->`,
  `<math><mtext><script>alert(1)</script></mtext></math>`,
  `<form><button formaction="javascript:alert(1)">x</button></form>`,
];

const DANGEROUS = /<\s*(script|img|svg|iframe|object|embed|style|form|button|a|body|math|link|meta)\b/i;

describe("escapeHtml", () => {
  it("escapes every HTML metacharacter", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes ampersands before other entities (no double-unescape)", () => {
    expect(escapeHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });

  it("coerces non-string input safely", () => {
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(undefined)).toBe("undefined");
    expect(escapeHtml(123)).toBe("123");
  });
});

describe("renderMarkdown neutralizes user/model-controlled HTML", () => {
  for (const payload of PAYLOADS) {
    it(`neutralizes: ${payload.slice(0, 42)}`, () => {
      const out = renderMarkdown(payload);
      expect(out).not.toMatch(DANGEROUS);
      expect(out).not.toMatch(/\son[a-z]+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).toContain("&lt;");
    });
  }

  it("keeps payloads escaped inside markdown constructs", () => {
    const out = renderMarkdown(
      "## <script>alert(1)</script>\n\n**<img src=x onerror=alert(1)>**\n\n`<svg/onload=alert(1)>`\n\n- <iframe src=javascript:alert(1)>",
    );
    expect(out).not.toMatch(DANGEROUS);
    expect(out).not.toMatch(/javascript:(?!\/\/)/i);
    // Intended markdown structure still renders.
    expect(out).toContain("<h4>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<code>");
    expect(out).toContain("<li>");
  });

  it("escapes follow-up buttons in both attribute and text position", () => {
    const out = renderMarkdown(
      `Answer.\n\nFollow-ups:\n- " onclick="alert(1)" x="\n- <script>alert(1)</script>`,
    );
    expect(out).toContain('class="fq-btn"');
    expect(out).not.toMatch(DANGEROUS);
    // The only onclick present is the trusted handler emitted by the renderer.
    expect(out.match(/onclick=/g)?.length).toBe(2);
    expect(out).toContain('onclick="chatSend(this.dataset.q)"');
    expect(out).toContain("&quot;");
  });

  it("escapes framework tag content", () => {
    const out = renderMarkdown("[FRAMEWORK: <img src=x onerror=alert(1)>]");
    expect(out).toContain('<span class="fw-tag">');
    expect(out).not.toMatch(DANGEROUS);
  });

  it("does not let a payload break out of a paragraph", () => {
    const out = renderMarkdown(`</p><script>alert(1)</script><p>`);
    expect(out).not.toMatch(DANGEROUS);
  });
});

describe("chat rendering call sites", () => {
  it("only ever assigns innerHTML from renderMarkdown or trusted constants", () => {
    const assignments = [...html.matchAll(/innerHTML\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      const trusted =
        value.startsWith("renderMarkdown(") ||
        value.startsWith("''") ||
        value.startsWith('""') ||
        /^[A-Z_]+$/.test(value) ||
        /^(type === 'ai' \? AI_ICON : USR_ICON|`)/.test(value);
      expect(trusted, `untrusted innerHTML source: ${value}`).toBe(true);
    }
  });

  it("renders user messages with textContent, never innerHTML", () => {
    const fn = html.slice(html.indexOf("function addUserMsg("), html.indexOf("function makeAv("));
    expect(fn).toContain("bubble.textContent = text");
    expect(fn).not.toContain("innerHTML");
  });
});
