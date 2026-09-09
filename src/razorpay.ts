// Razorpay checkout helpers shared by the Express dev server and the Cloudflare Worker.

export type PlanId = "pro" | "business";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  amount: number; // in paise
  currency: "INR";
}

export const RAZORPAY_PLANS: Record<PlanId, PlanDefinition> = {
  pro: { id: "pro", name: "THRN Pro", amount: 39900, currency: "INR" },
  business: { id: "business", name: "THRN Business", amount: 119900, currency: "INR" },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === "pro" || value === "business";
}

function basicAuth(keyId: string, keySecret: string): string {
  const raw = `${keyId}:${keySecret}`;
  if (typeof btoa === "function") return btoa(raw);
  // Node fallback
  return Buffer.from(raw, "utf8").toString("base64");
}

export interface CreatedSubscription {
  subscriptionId: string;
  keyId: string;
  planId: string;
  plan: PlanDefinition;
}

export async function createRazorpaySubscription(
  keyId: string,
  keySecret: string,
  plan: PlanDefinition,
  planId: string,
  notes: Record<string, string> = {},
): Promise<CreatedSubscription> {
  if (!planId) throw new Error(`Razorpay plan is not configured for ${plan.id}.`);

  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth(keyId, keySecret)}`,
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 1200,
      quantity: 1,
      customer_notify: true,
      notes: { plan: plan.id, ...notes },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.id !== "string") {
    const detail =
      (data as { error?: { description?: string } }).error?.description ||
      `Razorpay subscription creation failed (${res.status})`;
    throw new Error(detail);
  }

  return {
    subscriptionId: data.id,
    keyId,
    planId,
    plan,
  };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPaymentSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export async function verifySubscriptionSignature(
  keySecret: string,
  paymentId: string,
  subscriptionId: string,
  signature: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(keySecret, `${paymentId}|${subscriptionId}`);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
