import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STYLE_RULES = `You write DMs in native 2026 style.
Rules:
- very short (max 2 lines, ideally 1)
- lowercase-first, natural human speed
- no emojis
- no formal structure or greetings like "Hello"
- no corporate tone, no AI phrasing, no over-politeness
- slightly imperfect grammar allowed ("u" ok when natural)
- must feel written, not generated
- do NOT explain what you wrote, do NOT add quotes or prefixes
Return ONLY the message text, nothing else.`;

/** Generate a "next best message" for a lead. Returns primary + alternative. */
export const generateDm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      handle: z.string().min(1).max(100),
      platform: z.string().max(40),
      followers: z.number().int().nonnegative().optional().nullable(),
      niche: z.string().max(120).optional().nullable(),
      state: z.enum(["NEW", "CONTACTED", "WAITING_RESPONSE", "COOLING", "STUCK"]).default("NEW"),
      goal: z.enum(["reply", "book_call", "close"]).default("reply"),
      intent: z.enum(["curiosity", "direct", "soft", "business"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { callAiGateway } = await import("./ai-gateway.server");

    const intent =
      data.intent ??
      (data.state === "NEW" ? "curiosity" : data.state === "COOLING" ? "soft" : "direct");

    const context = [
      `Lead handle: @${data.handle}`,
      `Platform: ${data.platform}`,
      data.followers ? `Followers: ${data.followers}` : null,
      data.niche ? `Niche: ${data.niche}` : null,
      `Lead state: ${data.state}`,
      `User goal: ${data.goal}`,
      `Intent style: ${intent}`,
    ].filter(Boolean).join("\n");

    const [primary, alternative] = await Promise.all([
      callAiGateway({
        messages: [
          { role: "system", content: STYLE_RULES },
          { role: "user", content: `${context}\n\nWrite the primary DM.` },
        ],
        temperature: 0.95,
      }),
      callAiGateway({
        messages: [
          { role: "system", content: STYLE_RULES },
          { role: "user", content: `${context}\n\nWrite a different, alternative DM in another angle.` },
        ],
        temperature: 1.05,
      }),
    ]);

    return {
      primary: cleanMsg(primary),
      alternative: cleanMsg(alternative),
    };
  });

/** Suggest 3 short reply options given last message + lead state. */
export const generateReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      handle: z.string().min(1).max(100),
      lastIncomingMessage: z.string().min(1).max(2000),
      state: z.enum(["NEW", "CONTACTED", "WAITING_RESPONSE", "COOLING", "STUCK"]).default("CONTACTED"),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { callAiGateway } = await import("./ai-gateway.server");

    const sys = `${STYLE_RULES}
You write reply options labeled push/nurture/close.
Return strict JSON: {"replies":[{"label":"push","text":"..."},{"label":"nurture","text":"..."},{"label":"close","text":"..."}]}
No preamble.`;

    const raw = await callAiGateway({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `Lead: @${data.handle}\nState: ${data.state}\nTheir last message: "${data.lastIncomingMessage}"\n\nWrite 3 reply options.`,
        },
      ],
      temperature: 0.9,
    });

    try {
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        replies: Array<{ label: string; text: string }>;
      };
      return {
        replies: parsed.replies.slice(0, 3).map((r) => ({
          label: r.label,
          text: cleanMsg(r.text),
        })),
      };
    } catch {
      return { replies: [] };
    }
  });

function cleanMsg(s: string): string {
  return s.replace(/^["']|["']$/g, "").replace(/^\s*[-•]\s*/, "").trim();
}
