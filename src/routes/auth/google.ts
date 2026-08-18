import { createFileRoute } from "@tanstack/react-router";
import { getCookie, randomState, serializeCookie } from "../../lib/auth";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/auth/google")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const clientId = (env as Record<string, string | undefined>).GOOGLE_CLIENT_ID;
        if (!clientId) {
          return new Response("Google OAuth is not configured yet.", { status: 503 });
        }

        const url = new URL(request.url);
        const state = randomState();
        const redirectUri = `${url.origin}/auth/google/callback`;
        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", "openid email profile");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("prompt", "select_account");

        const existing = getCookie(request, "thrn_return");
        const returnPath = existing && existing.startsWith("/") ? existing : "/";

        return new Response(null, {
          status: 302,
          headers: {
            Location: authUrl.toString(),
            "Set-Cookie": [
              serializeCookie("thrn_oauth_state", state, { maxAge: 600 }),
              serializeCookie("thrn_return", returnPath, { maxAge: 600, httpOnly: false }),
            ].join(", "),
          },
        });
      },
    },
  },
});
