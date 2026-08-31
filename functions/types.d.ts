type PagesFunction<Env = Record<string, unknown>, Params extends string = string, Data extends Record<string, unknown> = Record<string, unknown>> = (
  context: {
    request: Request;
    functionPath: string;
    waitUntil: (promise: Promise<unknown>) => void;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    env: Env;
    params: Record<Params, string | string[]>;
    data: Data;
  }
) => Response | Promise<Response>;
