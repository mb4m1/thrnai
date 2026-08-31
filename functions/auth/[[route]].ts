interface Env {
  GEMINI_API_KEY?: string;
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  [key: string]: unknown;
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts[0]?.trim();
    if (key) {
      list[key] = decodeURIComponent((parts[1] || "").trim());
    }
  });
  return list;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Session check: /auth/me
  if (url.pathname === "/auth/me") {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sessionToken = cookies["thrn_session"];

    if (sessionToken) {
      try {
        const decoded = JSON.parse(atob(sessionToken));
        return new Response(JSON.stringify({ authenticated: true, user: decoded }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // invalid session token
      }
    }

    return new Response(JSON.stringify({ authenticated: false, user: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Google OAuth initialization: /auth/google
  if (url.pathname.startsWith("/auth/google")) {
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return Response.redirect(`${url.origin}/?auth_error=missing_client_id`, 302);
    }
    const redirectUri = `${url.origin}/auth/callback`;
    const scope = encodeURIComponent("openid email profile");
    const state = Math.random().toString(36).substring(2);
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;
    return Response.redirect(googleAuthUrl, 302);
  }

  // 3. OAuth callback: /auth/callback
  if (url.pathname === "/auth/callback") {
    const code = url.searchParams.get("code");
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      return Response.redirect(`${url.origin}/?auth_error=missing_credentials`, 302);
    }

    try {
      const redirectUri = `${url.origin}/auth/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        return Response.redirect(`${url.origin}/?auth_error=token_exchange_failed`, 302);
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return Response.redirect(`${url.origin}/?auth_error=userinfo_failed`, 302);
      }

      const userData = (await userRes.json()) as { name?: string; email?: string; picture?: string };
      const sessionPayload = btoa(
        JSON.stringify({
          name: userData.name,
          email: userData.email,
          picture: userData.picture,
          loggedInAt: new Date().toISOString(),
        })
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${url.origin}/`,
          "Set-Cookie": `thrn_session=${sessionPayload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        },
      });
    } catch {
      return Response.redirect(`${url.origin}/?auth_error=server_error`, 302);
    }
  }

  // 4. Logout: /auth/logout
  if (url.pathname === "/auth/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/`,
        "Set-Cookie": `thrn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  // Redirect any other action back to home
  return Response.redirect(`${url.origin}/`, 302);
};
