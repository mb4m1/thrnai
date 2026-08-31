interface Env {
  GEMINI_API_KEY?: string;
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  [key: string]: unknown;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/auth/me") {
    return new Response(JSON.stringify({ authenticated: false, user: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

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

  // Redirect for login/logout actions back to home
  return Response.redirect(`${url.origin}/`, 302);
};
