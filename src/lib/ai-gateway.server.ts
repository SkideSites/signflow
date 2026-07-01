// Server-only helper for calling Lovable AI Gateway (OpenAI-compatible).
// Small wrapper — kept minimal on purpose.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callAiGateway(opts: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages: opts.messages,
      temperature: opts.temperature ?? 0.9,
    }),
  });

  if (res.status === 429) throw new Error("Rate limited. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
