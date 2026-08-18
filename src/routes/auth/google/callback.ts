import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createSessionCookie, getCookie, serializeCookie } from "../../../lib/auth";

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

export const Route = createFileRoute("/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = (env as Record<string, string | undefined>).GOOGLE_CLIENT_ID;
        const clientSecret = (env as Record<string, string | undefined>).GOOGLE_CLIENT_SECRET;
        const authSecret = (env as Record<string, string | undefined>).AUTH_SECRET;
        if (!clientId || !clientSecret || !authSecret) {
          return new Response("Google OAuth is not configured yet.", { status: 503 });
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const savedState = getCookie(request, "thrn_oauth_state");
        const returnPath = getCookie(request, "thrn_return") || "/";

        if (!code || !state || !savedState || state !== savedState) {
          return new Response("Invalid OAuth state. Please try signing in again.", { status: 400 });
        }

        const redirectUri = `${url.origin}/auth/google/callback`;
        const tokenBody = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        });

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenBody,
        });

        if (!tokenResponse.ok) {
          console.error("[auth] Google token exchange failed", await tokenResponse.text());
          return new Response("Google sign-in failed. Please try again.", { status: 502 });
        }

        const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
        if (!tokens.access_token) {
          return new Response("Google did not return an access token.", { status: 502 });
        }

        const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResponse.ok) {
          console.error("[auth] Google userinfo failed", await userResponse.text());
          return new Response("Could not retrieve your Google profile.", { status: 502 });
        }

        const googleUser = (await userResponse.json()) as GoogleUserInfo;
        if (!googleUser.sub || !googleUser.email) {
          return new Response("Google account information was incomplete.", { status: 502 });
        }

        const session = await createSessionCookie({
          sub: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name || googleUser.email.split("@")[0],
          picture: googleUser.picture,
        }, authSecret);

        const headers = new Headers({ Location: returnPath.startsWith("/") ? returnPath : "/" });
        headers.append("Set-Cookie", serializeCookie("thrn_session", session, { maxAge: 60 * 60 * 24 * 14 }));
        headers.append("Set-Cookie", serializeCookie("thrn_oauth_state", "", { maxAge: 0 }));
        headers.append("Set-Cookie", serializeCookie("thrn_return", "", { maxAge: 0, httpOnly: false }));
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
