export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export const STAGES = [
  "TO_CONTACT",
  "CONTACTED",
  "REPLIED",
  "CALL_BOOKED",
  "NEGOTIATING",
  "SIGNED",
  "LOST",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  TO_CONTACT: "To Contact",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  CALL_BOOKED: "Call Booked",
  NEGOTIATING: "Negotiating",
  SIGNED: "Signed",
  LOST: "Lost",
};

export const JOURNEY_STAGES: Stage[] = ["CONTACTED", "REPLIED", "CALL_BOOKED", "SIGNED"];

export const ACTION_LABELS: Record<string, string> = {
  send_first_message: "Send first message",
  re_engage: "Re-engage lead",
  reply: "Reply waiting",
  call_prep: "Call preparation",
  call_completed: "Call completed",
  follow_up: "Follow-up due",
};
