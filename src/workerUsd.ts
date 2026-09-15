import baseWorker from "./worker";
import { RAZORPAY_PLANS, createRazorpaySubscription, isPlanId } from "./razorpay";

function envString(env: Record<string, unknown>, key: string): string {
  return typeof env[key] === "string" ? String(env[key]).trim() : "";
}

function acceptsInternationalCurrency(request: Request): boolean {
  const language = (request.headers.get("Accept-Language") || "").toLowerCase();
  return !language.includes("en-in") && !language.includes("hi-in") && !language.includes("mr-in");
}

const USD_PRICES: Record<string, string> = { pro: "$5 / month", business: "$15 / month" };
const INR_PRICES: Record<string, string> = { pro: "₹399 / month", business: "₹1,199 / month" };

function paymentScript(nonce = ""): string {
  return `<script nonce="${nonce}">
(() => {
  const getStoredCurrency = () => {
    const stored = localStorage.getItem('thrn-currency');
    return stored === 'USD' || stored === 'INR' ? stored : ((navigator.language || '').toLowerCase().startsWith('en-in') ? 'INR' : 'USD');
  };
  const currencyFromButton = (btn) => {
    const card = btn.closest('.price-card');
    const price = card?.querySelector('.price-value');
    const visiblePrice = (price?.textContent || '').trim();
    if (visiblePrice.includes('₹')) return 'INR';
    if (visiblePrice.includes('$')) return 'USD';
    const activeCurrency = document.querySelector('.currency-switcher .currency-btn.active')?.dataset.currency;
    if (activeCurrency === 'USD' || activeCurrency === 'INR') return activeCurrency;
    return getStoredCurrency();
  };
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('.price-btn[data-plan]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const btn = target;
    const plan = btn.dataset.plan;
    if (plan !== 'pro' && plan !== 'business') return;
    const currency = currencyFromButton(btn);
    const endpoint = currency === 'INR' ? '/api/razorpay/order/inr' : '/api/razorpay/order/usd';
    const label = btn.textContent || '';
    btn.disabled = true;
    btn.textContent = 'Opening checkout…';
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const d = (r.headers.get('content-type') || '').includes('application/json') ? await r.json() : {};
      if (!r.ok || !d.ok) throw new Error(d.error || 'Checkout unavailable');
      if (typeof Razorpay !== 'function') throw new Error('Checkout unavailable');
      const rzp = new Razorpay({
        key: d.keyId,
        subscription_id: d.subscriptionId,
        name: 'THRN',
        description: d.planName + ' — ' + d.displayPrice,
        theme: { color: '#7C9E7A' },
        handler: async function(resp) {
          btn.textContent = 'Confirming…';
          try {
            const v = await fetch('/api/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ plan, currency }, resp)) });
            const vd = (v.headers.get('content-type') || '').includes('application/json') ? await v.json() : {};
            btn.textContent = (v.ok && vd.ok) ? 'Payment received ✓' : 'Verification failed';
          } catch { btn.textContent = 'Verification failed'; }
          btn.disabled = true;
        },
        modal: { ondismiss: function() { btn.disabled = false; btn.textContent = label; } }
      });
      rzp.open();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      alert(err instanceof Error ? err.message : 'Could not start checkout. Please try again.');
    }
  }, true);
})();
</script>`;
}

function basicAuth(keyId: string, keySecret: string): string { return btoa(`${keyId}:${keySecret}`); }

async function fetchRazorpayPlanCurrency(keyId: string, keySecret: string, planId: string): Promise<string> {
  const response = await fetch(`https://api.razorpay.com/v1/plans/${encodeURIComponent(planId)}`, { method: "GET", headers: { Authorization: `Basic ${basicAuth(keyId, keySecret)}` } });
  const data = (await response.json().catch(() => ({}))) as { item?: { currency?: unknown }; error?: { description?: string } };
  if (!response.ok) throw new Error(data.error?.description || `Could not verify Razorpay plan ${planId}.`);
  const currency = typeof data.item?.currency === "string" ? data.item.currency : "";
  if (!currency) throw new Error(`Razorpay plan ${planId} did not return a currency.`);
  return currency;
}

async function fetchRazorpaySubscriptionPlanId(keyId: string, keySecret: string, subscriptionId: string): Promise<string> {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET", headers: { Authorization: `Basic ${basicAuth(keyId, keySecret)}` } });
  const data = (await response.json().catch(() => ({}))) as { plan_id?: unknown; error?: { description?: string } };
  if (!response.ok) throw new Error(data.error?.description || `Could not verify Razorpay subscription ${subscriptionId}.`);
  const planId = typeof data.plan_id === "string" ? data.plan_id.trim() : "";
  if (!planId) throw new Error(`Razorpay subscription ${subscriptionId} did not return a plan_id.`);
  return planId;
}

async function handleRazorpayOrder(request: Request, env: Record<string, unknown>, forcedCurrency?: "INR" | "USD"): Promise<Response> {
  const keyId = envString(env, "RAZORPAY_KEY_ID");
  const keySecret = envString(env, "RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return new Response(JSON.stringify({ ok: false, error: "Payments are not configured yet." }), { status: 503, headers: { "Content-Type": "application/json" } });
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown; currency?: unknown };
  if (!isPlanId(body.plan)) return new Response(JSON.stringify({ ok: false, error: "Unknown plan." }), { status: 400, headers: { "Content-Type": "application/json" } });
  const requestedCurrency = body.currency === "USD" || body.currency === "INR" ? body.currency : null;
  const currency = forcedCurrency || requestedCurrency || (acceptsInternationalCurrency(request) ? "USD" : "INR");
  const plan = RAZORPAY_PLANS[body.plan];
  const planId = currency === "USD" ? envString(env, body.plan === "pro" ? "RAZORPAY_PRO_USD_PLAN_ID" : "RAZORPAY_BUSINESS_USD_PLAN_ID") : envString(env, body.plan === "pro" ? "RAZORPAY_PRO_PLAN_ID" : "RAZORPAY_BUSINESS_PLAN_ID");
  if (!planId) return new Response(JSON.stringify({ ok: false, error: `Razorpay ${body.plan} ${currency} subscription plan is not configured yet.` }), { status: 503, headers: { "Content-Type": "application/json" } });
  try {
    const actualCurrency = await fetchRazorpayPlanCurrency(keyId, keySecret, planId);
    if (actualCurrency !== currency) throw new Error(`Razorpay plan currency mismatch: requested ${currency}, but plan ${planId} is ${actualCurrency}. Check the Cloudflare plan ID variables.`);
    const subscription = await createRazorpaySubscription(keyId, keySecret, plan, planId, { plan: body.plan, currency });
    const createdSubscriptionPlanId = await fetchRazorpaySubscriptionPlanId(keyId, keySecret, subscription.subscriptionId);
    if (createdSubscriptionPlanId !== planId) {
      throw new Error(`Razorpay subscription plan mismatch: expected ${planId}, but subscription ${subscription.subscriptionId} uses ${createdSubscriptionPlanId}.`);
    }
    return new Response(JSON.stringify({ ok: true, keyId: subscription.keyId, subscriptionId: subscription.subscriptionId, plan: body.plan, planName: subscription.plan.name, currency, displayPrice: currency === "USD" ? USD_PRICES[body.plan] : INR_PRICES[body.plan], planId, verifiedPlanId: createdSubscriptionPlanId }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[Worker] Razorpay subscription error:", err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Could not start checkout. Please try again." }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/razorpay/order/inr" && request.method === "POST") return handleRazorpayOrder(request, env, "INR");
    if (url.pathname === "/api/razorpay/order/usd" && request.method === "POST") return handleRazorpayOrder(request, env, "USD");
    if (url.pathname === "/api/razorpay/order" && request.method === "POST") return handleRazorpayOrder(request, env);
    const response = await baseWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const headers = new Headers(response.headers);
      headers.delete("Content-Length"); headers.delete("Content-Encoding"); headers.delete("ETag");
      const nonceMatch = html.match(/<script\s+nonce="([^"]+)"/i);
      const nonce = nonceMatch?.[1] || "";
      const injected = paymentScript(nonce);
      return new Response(html.replace(/<body([^>]*)>/i, `<body$1>${injected}`), { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};