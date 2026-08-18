import { createFileRoute } from "@tanstack/react-router";
import { clearCookie } from "../../lib/auth";

export const Route = createFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: ({ request }) => new Response(null, {
        status: 302,
        headers: {
          Location: new URL("/", request.url).toString(),
          "Set-Cookie": clearCookie("thrn_session"),
        },
      }),
    },
  },
});
