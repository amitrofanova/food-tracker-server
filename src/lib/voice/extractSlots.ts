import { mealFromToken } from "./meals";
import type { VoiceSlots } from "./types";

function parseNullableNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

export function extractSlots(normalized: string): VoiceSlots {
  const meal = mealFromToken(
    normalized.match(
      /(?<!\p{L})(завтрак\p{L}*|обед\p{L}*|ужин\p{L}*|перекус\p{L}*|breakfast|lunch|dinner|snack)(?!\p{L})/u,
    )?.[1],
  );

  const weightMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:г|гр|грамм(?:а|ов)?|grams?|g)(?!\p{L})/u,
  );
  const caloriesMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:ккал|килокалори\p{L}*|калори\p{L}*|kcal|cal)(?!\p{L})/u,
  );
  const proteinMatch = normalized.match(
    /(?:белк(?:и|а|ов)?|protein)\s*[:\s-]*(\d+(?:[.,]\d+)?)/,
  );
  const fatMatch = normalized.match(
    /(?:жиры|жира|жиров|fat)\s*[:\s-]*(\d+(?:[.,]\d+)?)/,
  );
  const carbsMatch = normalized.match(
    /(?:углевод(?:ы|ов|а)?|carbs?)\s*[:\s-]*(\d+(?:[.,]\d+)?)/,
  );

  return {
    meal,
    weight: parseNullableNumber(weightMatch?.[1]),
    calories: parseNullableNumber(caloriesMatch?.[1]),
    protein: parseNullableNumber(proteinMatch?.[1]),
    fat: parseNullableNumber(fatMatch?.[1]),
    carbs: parseNullableNumber(carbsMatch?.[1]),
  };
}
