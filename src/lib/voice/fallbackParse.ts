import { extractSlots } from "./extractSlots";
import { MEAL_WORD_PATTERN, mealFromToken } from "./meals";
import { normalizeTranscript } from "./normalize";
import type { VoiceMeal, VoiceParseResponse } from "./types";

const COMMAND_PATTERN =
  /(?<!\p{L})(добавь|добавить|add|положи|возьми|take|eat|съешь|запиши|поставь)(?!\p{L})/giu;

const COMMAND_WORDS = new Set([
  "добавь",
  "добавить",
  "add",
  "положи",
  "возьми",
  "take",
  "eat",
  "съешь",
  "запиши",
  "поставь",
]);

const STOP_WORDS = new Set([
  "к",
  "на",
  "в",
  "о",
  "по",
  "из",
  "у",
  "и",
  "или",
  "то",
  "мне",
  "пожалуйста",
  "еще",
  "ещё",
  "дай",
  "для",
  "это",
]);

export function isMeaningfulProductName(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/[—–\-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}%]+/gu, ""))
    .filter(Boolean);
  const leftover = tokens.filter(
    (token) =>
      !STOP_WORDS.has(token) &&
      !COMMAND_WORDS.has(token) &&
      mealFromToken(token) === null,
  );
  return leftover.some((token) => token.length >= 2 && !/^\d+$/.test(token));
}

export function fallbackParse(
  transcript: string,
  fallbackMeal: VoiceMeal,
): VoiceParseResponse | null {
  const normalized = normalizeTranscript(transcript);
  const slots = extractSlots(normalized);

  const productName = normalized
    .replace(MEAL_WORD_PATTERN, " ")
    .replace(COMMAND_PATTERN, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:г|гр|грамм(?:а|ов)?|grams?|g)(?!\p{L})/giu, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:ккал|килокалори\p{L}*|калори\p{L}*|kcal|cal)(?!\p{L})/giu, " ")
    .replace(
      /(?:белк(?:и|а|ов)?|protein|жиры|жира|жиров|fat|углевод(?:ы|ов|а)?|carbs?)\s*[:\s-]*\d+(?:[.,]\d+)?/gi,
      " ",
    )
    .replace(/[—–\-]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !STOP_WORDS.has(token) &&
        !COMMAND_WORDS.has(token) &&
        mealFromToken(token) === null,
    )
    .join(" ")
    .trim();

  if (!isMeaningfulProductName(productName)) return null;

  return {
    intent: "add_entry",
    productName,
    searchQuery: productName,
    weight: slots.weight,
    meal: slots.meal ?? fallbackMeal,
    calories: slots.calories,
    protein: slots.protein,
    fat: slots.fat,
    carbs: slots.carbs,
    matchedProduct: null,
  };
}
