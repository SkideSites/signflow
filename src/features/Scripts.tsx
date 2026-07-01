import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type ScriptStage = "first_contact" | "follow_up" | "closing";

type Script = { id: string; stage: ScriptStage; text: string };

// Reusable DM-native 2026 templates. Ultra-short, no emojis, no formal structure.
const SCRIPTS: Script[] = [
  // First contact
  { id: "fc1", stage: "first_contact", text: "hey u still doing this?" },
  { id: "fc2", stage: "first_contact", text: "yo quick one, u open rn?" },
  { id: "fc3", stage: "first_contact", text: "was wondering smth about your setup" },
  { id: "fc4", stage: "first_contact", text: "curious how ur handling this side of things" },
  { id: "fc5", stage: "first_contact", text: "quick q about what ur doing here" },

  // Follow-up
  { id: "fu1", stage: "follow_up", text: "hey did u see my last msg" },
  { id: "fu2", stage: "follow_up", text: "still down to chat?" },
  { id: "fu3", stage: "follow_up", text: "bumping this up, worth a 5min?" },
  { id: "fu4", stage: "follow_up", text: "no rush just circling back" },

  // Closing
  { id: "cl1", stage: "closing", text: "wanna lock it in this week?" },
  { id: "cl2", stage: "closing", text: "u wanna hop on a quick call to close it out?" },
  { id: "cl3", stage: "closing", text: "cool if we start monday?" },
  { id: "cl4", stage: "closing", text: "should i send over the details?" },
];

const STAGE_LABELS: Record<ScriptStage, string> = {
  first_contact: "First contact",
  follow_up: "Follow-up",
  closing: "Closing",
};

export function Scripts() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (s: Script) => {
    try {
      await navigator.clipboard.writeText(s.text);
      setCopiedId(s.id);
      toast.success("Copied");
      setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  const stages: ScriptStage[] = ["first_contact", "follow_up", "closing"];

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Message scripts</h1>
        <p className="text-sm text-muted-foreground">
          Reusable DMs by lead stage. Tap to copy, send manually.
        </p>
      </header>

      {stages.map((st) => (
        <section key={st} className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-1">
            {STAGE_LABELS[st]}
          </div>
          <div className="space-y-2">
            {SCRIPTS.filter((s) => s.stage === st).map((s) => (
              <button
                key={s.id}
                onClick={() => copy(s)}
                className="w-full elevated-card p-4 text-left transition hover:bg-surface-hover flex items-center gap-3"
              >
                <span className="flex-1 text-sm">{s.text}</span>
                {copiedId === s.id ? (
                  <Check className="size-4 text-primary shrink-0" />
                ) : (
                  <Copy className="size-4 text-muted-foreground shrink-0" />
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
