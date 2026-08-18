import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getCookie, verifySessionCookie } from "../../lib/auth";

export const Route = createFileRoute("/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authSecret = (env as Record<string, string | undefined>).AUTH_SECRET;
        const user = await verifySessionCookie(getCookie(request, "thrn_session"), authSecret || "");
        return new Response(JSON.stringify({ authenticated: !!user, user: user ? {
          id: user.sub,
          email: user.email,
          name: user.name,
          picture: user.picture || null,
        } : null }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
