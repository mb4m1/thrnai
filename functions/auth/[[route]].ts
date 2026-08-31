export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  if (url.pathname === "/auth/me") {
    return new Response(JSON.stringify({ authenticated: false, user: null }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Redirect for login/logout actions back to home
  return Response.redirect(`${url.origin}/`, 302);
};
