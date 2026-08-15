import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type WorkersAI = {
  run: (
    model: string,
    input: { messages: Array<{ role: string; content: string }>; max_tokens: number },
  ) => Promise<unknown>;
};

type CloudflareRuntimeEnv = {
  AI?: WorkersAI;
};

type ServerRequestOptions = {
  context?: {
    cloudflare: CloudflareRuntimeEnv;
  };
};

declare module "@tanstack/react-router" {
  interface Register {
    server: {
      requestContext: {
        cloudflare: CloudflareRuntimeEnv;
      };
    };
  }
}

type ServerEntry = {
  fetch: (request: Request, options?: ServerRequestOptions) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, _ctx: unknown) {
    try {
      const cloudflareEnv = env as CloudflareRuntimeEnv;
      const handler = await getServerEntry();
      // TanStack Start's server route handlers receive request context, not the
      // raw Cloudflare Worker env argument. Pass the real Worker bindings into
      // that context so routes can reliably access env.AI at request time.
      const response = await handler.fetch(request, {
        context: { cloudflare: cloudflareEnv },
      });
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
