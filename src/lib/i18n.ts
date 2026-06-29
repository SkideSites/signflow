// Lightweight language preference store. Real translations are a future step;
// for v1 we persist the user's choice so onboarding + Settings feel real.
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

const KEY = "signflow:lang";

export function getLang(): LangCode {
  if (typeof window === "undefined") return "en";
  const v = localStorage.getItem(KEY);
  if (v && LANGUAGES.some((l) => l.code === v)) return v as LangCode;
  return "en";
}

export function setLang(code: LangCode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, code);
}
