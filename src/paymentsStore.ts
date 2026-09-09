// Server-side payment recording. Shared by the Express dev server and the Cloudflare Worker.
import { RAZORPAY_PLANS, type PlanId } from "./razorpay";

export interface PaymentRecord {
  email?: string | null;
  contact?: string | null;
  plan: PlanId;
  amount?: number;
  currency?: string;
  status?: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string | null;
  source?: string;
}

interface StoreEnv {
  url?: string;
  serviceKey?: string;
}

/** Upsert a payment row keyed on the Razorpay order id. Returns true when stored. */
export async function recordPayment(env: StoreEnv, record: PaymentRecord): Promise<boolean> {
  const base = (env.url || "").replace(/\/$/, "");
  const key = env.serviceKey || "";
  if (!base || !key) {
    console.warn("[payments] backend not configured; skipping record for", record.razorpay_order_id);
    return false;
  }
  const plan = RAZORPAY_PLANS[record.plan];
  const row = {
    email: record.email ? String(record.email).toLowerCase() : null,
    contact: record.contact || null,
    plan: record.plan,
    amount: typeof record.amount === "number" ? record.amount : plan.amount,
    currency: record.currency || plan.currency,
    status: record.status || "paid",
    razorpay_order_id: record.razorpay_order_id,
    razorpay_payment_id: record.razorpay_payment_id || null,
    source: record.source || "checkout",
  };

  try {
    const res = await fetch(
      `${base}/rest/v1/payments?on_conflict=razorpay_order_id`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
      },
    );
    if (!res.ok) {
      console.error("[payments] store failed:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[payments] store error:", err);
    return false;
  }
}

/** Fetch a payment from Razorpay so we can record the payer's email/contact. */
export async function fetchRazorpayPayment(
  keyId: string,
  keySecret: string,
  paymentId: string,
): Promise<{ email?: string; contact?: string; amount?: number; currency?: string } | null> {
  const raw = `${keyId}:${keySecret}`;
  const auth =
    typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf8").toString("base64");
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      email: typeof data.email === "string" ? data.email : undefined,
      contact: typeof data.contact === "string" ? data.contact : undefined,
      amount: typeof data.amount === "number" ? data.amount : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
    };
  } catch {
    return null;
  }
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

/** Verify the X-Razorpay-Signature header against the raw webhook body. */
export async function verifyWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!webhookSecret || !rawBody || !signature) return false;
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

interface WebhookPayment {
  id?: string;
  order_id?: string;
  email?: string;
  contact?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, unknown>;
}

/** Turn a razorpay webhook body into a payment record (or null when not relevant). */
export function paymentRecordFromWebhook(body: any): PaymentRecord | null {
  const event = typeof body?.event === "string" ? body.event : "";
  const entity: WebhookPayment | undefined = body?.payload?.payment?.entity;
  if (!entity || !entity.order_id) return null;
  const planNote = entity.notes?.plan;
  const plan: PlanId = planNote === "business" ? "business" : "pro";
  const status =
    event === "payment.captured" || event === "payment.authorized"
      ? "paid"
      : event === "payment.failed"
      ? "failed"
      : "pending";
  return {
    email: entity.email || null,
    contact: entity.contact || null,
    plan,
    amount: entity.amount,
    currency: entity.currency,
    status,
    razorpay_order_id: entity.order_id,
    razorpay_payment_id: entity.id || null,
    source: "webhook",
  };
}
