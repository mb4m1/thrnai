import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildCsp, createNonce, NONCE_PLACEHOLDER } from "../routes/index";

const html = readFileSync(fileURLToPath(new URL("./thrn.html", import.meta.url)), "utf8");

function render(nonce: string) {
  return html.replaceAll(NONCE_PLACEHOLDER, nonce);
}

describe("CSP policy", () => {
  const policy = buildCsp("abc123");

  it("blocks inline scripts except the nonced ones", () => {
    expect(policy).toContain("script-src 'self' 'nonce-abc123'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("locks down other risky sinks", () => {
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("default-src 'self'");
  });

  it("mints unique, non-trivial nonces", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});

describe("served document is CSP-compatible", () => {
  it("gives every script tag the request nonce", () => {
    const out = render("nonce-value");
    const tags = out.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag, `script tag missing nonce: ${tag}`).toContain('nonce="nonce-value"');
    }
    expect(out).not.toContain(NONCE_PLACEHOLDER);
  });

  it("has no inline event handler attributes (they are blocked by a nonce CSP)", () => {
    const matches = html.match(/\son[a-z]+\s*=\s*["'][^"']*["']/gi) ?? [];
    expect(matches, `inline handlers found: ${matches.join(", ")}`).toHaveLength(0);
  });

  it("has no javascript: URLs", () => {
    expect(html).not.toMatch(/(?:href|src|action)\s*=\s*["']\s*javascript:/i);
  });

  it("wires interactions through delegated data-action handlers", () => {
    expect(html).toContain('data-action="send"');
    expect(html).toContain('data-action="set-mode"');
    expect(html).toContain('data-action="reset-chat"');
    expect(html).toContain('data-action="close-menu"');
    expect(html).toContain("document.addEventListener('click'");
  });
});
