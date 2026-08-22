import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const composerSizingMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  if (!html.includes("#chat-input") || !html.includes(".composer")) {
    return new Response(html, response);
  }

  const style = `<style>
/* THRN chat composer: give the primary interaction more visual presence. */
.composer { padding: 16px 18px 15px !important; }
.composer-row { gap: 11px !important; }
#chat-input {
  min-height: 56px !important;
  padding: 13px 16px !important;
  font-size: 14px !important;
  border-radius: 10px !important;
}
#chat-send, #chat-attach {
  width: 48px !important;
  height: 48px !important;
  border-radius: 10px !important;
}
.composer-footer { margin-top: 11px !important; }
@media (max-width: 768px) {
  .composer { padding: 13px 12px 12px !important; }
  #chat-input { min-height: 54px !important; padding: 12px 14px !important; }
  #chat-send, #chat-attach { width: 46px !important; height: 46px !important; }
}
</style>`;

  const patchedHtml = html.includes("</head>")
    ? html.replace("</head>", `${style}</head>`)
    : html;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(patchedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, composerSizingMiddleware],
}));
