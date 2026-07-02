import { createFileRoute } from "@tanstack/react-router";
import alexHtml from "../content/alex.html?raw";

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: () =>
        new Response(alexHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
          },
        }),
    },
  },
});
