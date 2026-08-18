const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlString(value: string): string {
  return base64url(encoder.encode(value));
}

function decodeBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, value: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

async function verifyHmac(secret: string, value: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, decodeBase64url(signature), encoder.encode(value));
}

export interface ThrnUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  exp: number;
}

export async function createSessionCookie(user: Omit<ThrnUser, "exp">, secret: string): Promise<string> {
  const payload: ThrnUser = { ...user, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14 };
  const body = base64urlString(JSON.stringify(payload));
  const signature = base64url(new Uint8Array(await hmac(secret, body)));
  return `${body}.${signature}`;
}

export async function verifySessionCookie(value: string | null, secret: string): Promise<ThrnUser | null> {
  if (!value || !secret) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!(await verifyHmac(secret, body, signature))) return null;

  try {
    const user = JSON.parse(decoder.decode(decodeBase64url(body))) as ThrnUser;
    if (!user.sub || !user.email || !user.exp || user.exp <= Math.floor(Date.now() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function serializeCookie(name: string, value: string, options: {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
} = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
}

export function clearCookie(name: string): string {
  return serializeCookie(name, "", { maxAge: 0 });
}

export function randomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
