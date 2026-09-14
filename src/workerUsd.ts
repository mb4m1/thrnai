import baseWorker from "./worker";
import { RAZORPAY_PLANS, createRazorpaySubscription, isPlanId } from "./razorpay";

function envString(env: Record<string, unknown>, key: string): string {
  return typeof env[key] === "string" ? String(env[key]) : "";
}

function acceptsInternationalCurrency(request: Request): boolean {
  const language = (request.headers.get("Accept-Language") || "").toLowerCase();
  return !language.includes("en-in") && !language.includes("hi-in") && !language.includes("mr-in");
}

const USD_PRICES: Record<string, string> = {
  pro: "$5 / month",
  business: "$15 / month",
};

function paymentScript(nonce = ""): string {
  return `<script nonce="${nonce}">
(() => {
  const originalButtons = document.querySelectorAll('.price-btn[data-plan]');
  if (!originalButtons.length) return;

  const getStoredCurrency = () => {
    const stored = localStorage.getItem('thrn-currency');
    return stored === 'USD' || stored === 'INR' ? stored : ((navigator.language || '').toLowerCase().startsWith('en-in') ? 'INR' : 'USD');
  };

  const currencyFromButton = (btn) => {
    const activeCurrency = document.querySelector('.currency-btn.active')?.dataset.currency;
    if (activeCurrency === 'USD' || activeCurrency === 'INR') return activeCurrency;

    const card = btn.closest('.price-card');
    const price = card?.querySelector('.price-value');
    const dataUsd = price?.getAttribute('data-usd');
    const dataInr = price?.getAttribute('data-inr');
    const visiblePrice = (price?.textContent || '').trim();
    if (visiblePrice.includes('₹') || dataInr === visiblePrice) return 'INR';
    if (visiblePrice.includes('$') || dataUsd === visiblePrice) return 'USD';

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
    const label = btn.textContent || '';
    btn.disabled = true;
    btn.textContent = 'Opening checkout…';

    try {
      const r = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, currency })
      });
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
            const v = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.assign({ plan, currency }, resp))
            });
            const vd = (v.headers.get('content-type') || '').includes('application/json') ? await v.json() : {};
            btn.textContent = (v.ok && vd.ok) ? 'Payment received ✓' : 'Verification failed';
          } catch {
            btn.textContent = 'Verification failed';
          }
          btn.disabled = true;
        },
        modal: {
          ondismiss: function() {
            btn.disabled = false;
            btn.textContent = label;
          }
        }
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

async function handleRazorpayOrder(request: Request, env: Record<string, unknown>): Promise<Response> {
  const keyId = envString(env, "RAZORPAY_KEY_ID");
  const keySecret = envString(env, "RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    return new Response(JSON.stringify({ ok: false, error: "Payments are not configured yet." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown; currency?: unknown };
  if (!isPlanId(body.plan)) {
    return new Response(JSON.stringify({ ok: false, error: "Unknown plan." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const requestedCurrency = body.currency === "USD" || body.currency === "INR" ? body.currency : null;
  const currency = requestedCurrency || (acceptsInternationalCurrency(request) ? "USD" : "INR");
  const plan = RAZORPAY_PLANS[body.plan];
  const planId = currency === "USD"
    ? envString(env, body.plan === "pro" ? "RAZORPAY_PRO_USD_PLAN_ID" : "RAZORPAY_BUSINESS_USD_PLAN_ID")
    : envString(env, body.plan === "INR" ? "" : "RAZORPAY_PRO_PLAN_ID");

  const resolvedPlanId = currency === "USD"
    ? envString(env, body.plan === "pro" ? "RAZORPAY_PRO_USD_PLAN_ID" : "RAZORPAY_BUSINESS_USD_PLAN_ID")
    : envString(env, body.plan === "pro" ? "RAZORPAY_PRO_PLAN_ID" : "RAZORPAY_BUSINESS_PLAN_ID");

  if (!resolvedPlanId) {
    return new Response(JSON.stringify({ ok: false, error: `Razorpay ${body.plan} ${currency} subscription plan is not configured yet.` }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const subscription = await createRazorpaySubscription(keyId, keySecret, plan, resolvedPlanId, {
      plan: body.plan,
      currency,
    });
    return new Response(JSON.stringify({
      ok: true,
      keyId: subscription.keyId,
      subscriptionId: subscription.subscriptionId,
      plan: body.plan,
      planName: subscription.plan.name,
      currency,
      displayPrice: currency === "USD" ? USD_PRICES[body.plan] : (body.plan === "pro" ? "₹399 / month" : "₹1,199 / month"),
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[Worker] Razorpay subscription error:", err);
    return new Response(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : "Could not start checkout. Please try again.",
    }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/razorpay/order" && request.method === "POST") {
      return handleRazorpayOrder(request, env);
    }

    const response = await baseWorker.fetch(request, env, ctx);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const headers = new Headers(response.headers);
      headers.delete("Content-Length");
      headers.delete("Content-Encoding");
      headers.delete("ETag");
      const nonceMatch = html.match(/<script\s+nonce="([^"]+)"/i);
      const nonce = nonceMatch?.[1] || "";
      return new Response(html.replace("</body>", `${paymentScript(nonce)}</body>`), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};
