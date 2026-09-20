import type { VoiceMeal } from "./types";

export const MEAL_ALIASES: Record<string, VoiceMeal> = {
  breakfast: "breakfast",
  завтрак: "breakfast",
  lunch: "lunch",
  обед: "lunch",
  dinner: "dinner",
  ужин: "dinner",
  snack: "snack",
  перекус: "snack",
};

export const MEAL_WORD_PATTERN =
  /(?<!\p{L})(завтрак\p{L}*|обед\p{L}*|ужин\p{L}*|перекус\p{L}*|breakfast|lunch|dinner|snack)(?!\p{L})/giu;

export function mealFromToken(token: string | undefined): VoiceMeal | null {
  if (!token) return null;
  const key = token.toLowerCase();
  if (MEAL_ALIASES[key]) return MEAL_ALIASES[key];
  if (key.startsWith("завтрак")) return "breakfast";
  if (key.startsWith("обед")) return "lunch";
  if (key.startsWith("ужин")) return "dinner";
  if (key.startsWith("перекус")) return "snack";
  return null;
}

export function resolveMeal(
  raw: string | null | undefined,
  fallback: VoiceMeal,
): VoiceMeal {
  const key = String(raw ?? "")
    .toLowerCase()
    .trim();
  return MEAL_ALIASES[key] ?? fallback;
}
