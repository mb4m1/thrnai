import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1, "Message required").max(1000),
});

export const Route = createFileRoute("/api/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = contactSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", issues: parsed.error.flatten() },
            { status: 400 },
          );
        }
        // Log the submission on the server. Wire to email/DB later as needed.
        console.log("[contact] new submission:", {
          name: parsed.data.name,
          email: parsed.data.email,
          length: parsed.data.message.length,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
