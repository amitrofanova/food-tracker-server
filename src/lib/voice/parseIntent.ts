import { prisma } from "../prisma";
import { extractSlots } from "./extractSlots";
import { fallbackParse } from "./fallbackParse";
import { matchCatalog } from "./matchCatalog";
import { resolveMeal } from "./meals";
import { normalizeTranscript } from "./normalize";
import {
  formatSchemaIssues,
  llmVoiceIntentSchema,
  VOICE_JSON_SCHEMA,
} from "./schema";
import type {
  MatchedProduct,
  VoiceLogger,
  VoiceMeal,
  VoiceParseResponse,
  VoiceSlots,
} from "./types";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_TIMEOUT_MS = 15_000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function resolveModels(): string[] {
  const extras = (process.env.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  return [...new Set([primary, ...extras])];
}

function extractJsonObject(text: string): string | null {
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0] ?? null;
}

function slotsHint(slots: VoiceSlots, fallbackMeal: VoiceMeal): string {
  return [
    `spoken meal: ${slots.meal ?? "null"}`,
    `fallback meal if spoken meal is null: ${fallbackMeal}`,
    `weightGrams hint: ${slots.weight ?? "null"}`,
    `calories hint: ${slots.calories ?? "null"}`,
    `protein hint: ${slots.protein ?? "null"}`,
    `fat (grams of fat, NOT dairy % in the name) hint: ${slots.fat ?? "null"}`,
    `carbs hint: ${slots.carbs ?? "null"}`,
  ].join("; ");
}

function buildPrompt(
  transcripts: string[],
  fallbackMeal: VoiceMeal,
  slots: VoiceSlots,
): string {
  const listed = transcripts
    .map((text, index) => `${index + 1}. ${normalizeTranscript(text)}`)
    .join("\n");

  return (
    `Extract a food-diary command from speech transcripts (Russian or English).\n` +
    `Most likely transcript is first.\n` +
    `intent: add_entry if the user wants to log food; unknown if unrelated; ` +
    `needs_clarification if it is about food but the product is unclear.\n` +
    `productName must be nominative case (именительный падеж). ` +
    `Examples: "фисташек"→"фисташки", "творога"→"творог", "сыра"→"сыр".\n` +
    `If the user says a catalog fat content such as "творог 9%", "сметана 20%", ` +
    `"молоко 3,5%", "масло 82%", put that percentage in productName: "творог 9%". ` +
    `Do not invent a percentage. Dairy % in the name is NOT grams of fat.\n` +
    `fat/protein/carbs/calories must be null unless the user explicitly said those macros ` +
    `(ккал, калории, белки, жиры in grams, углеводы).\n` +
    `weightGrams is integer grams or null. meal is breakfast|lunch|dinner|snack or null.\n` +
    `If the user did not mention a meal, set meal to null. Do not guess a meal.\n` +
    `A fallback of "${fallbackMeal}" is applied later when meal is null.\n` +
    `Deterministic hints: ${slotsHint(slots, fallbackMeal)}\n` +
    `Transcripts:\n${listed}`
  );
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callOpenRouter(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://food-tracker.app",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 250,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "voice_intent",
            strict: true,
            schema: VOICE_JSON_SCHEMA,
          },
        },
        provider: { require_parameters: true },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
    };
    const message = data.choices?.[0]?.message ?? {};
    const text: string = message.content || message.reasoning || "";
    return { ok: true, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function findUniqueCatalogMatch(
  userId: number,
  searchQuery: string,
): Promise<MatchedProduct | null> {
  const [products, recipes] = await Promise.all([
    prisma.customProduct.findMany({
      where: { userId },
      select: { id: true, name: true, calories: true, protein: true, fat: true, carbs: true },
    }),
    prisma.recipe.findMany({
      where: { userId },
      select: { id: true, name: true, calories: true, protein: true, fat: true, carbs: true },
    }),
  ]);
  return matchCatalog(searchQuery, [...products, ...recipes]);
}

function toResponse(
  parsed: {
    intent: VoiceParseResponse["intent"];
    productName: string | null;
    weightGrams: number | null;
    meal: VoiceMeal | null;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
  },
  fallbackMeal: VoiceMeal,
  slots: VoiceSlots,
  matchedProduct: MatchedProduct | null,
): VoiceParseResponse {
  const productName = parsed.productName;
  return {
    intent: parsed.intent,
    productName,
    searchQuery: productName,
    weight: parsed.weightGrams ?? slots.weight,
    meal: slots.meal ?? fallbackMeal,
    calories: parsed.calories ?? slots.calories,
    protein: parsed.protein ?? slots.protein,
    fat: parsed.fat ?? slots.fat,
    carbs: parsed.carbs ?? slots.carbs,
    matchedProduct,
  };
}

export type ParseVoiceIntentResult =
  | { ok: true; data: VoiceParseResponse }
  | { ok: false; error: "transcript_required" | "parse_failed" };

export async function parseVoiceIntent(input: {
  transcripts: string[];
  defaultMeal: VoiceMeal;
  userId: number;
  apiKey: string | undefined;
  models: string[];
  log: VoiceLogger;
}): Promise<ParseVoiceIntentResult> {
  const transcripts = input.transcripts
    .map((item) => item.trim())
    .filter(Boolean);
  if (transcripts.length === 0) {
    return { ok: false, error: "transcript_required" };
  }

  const primary = transcripts[0] ?? "";
  const slotList = transcripts.map((text) => extractSlots(normalizeTranscript(text)));
  const slots = {
    meal: slotList.find((item) => item.meal)?.meal ?? null,
    weight: slotList.find((item) => item.weight !== null)?.weight ?? null,
    calories: slotList.find((item) => item.calories !== null)?.calories ?? null,
    protein: slotList.find((item) => item.protein !== null)?.protein ?? null,
    fat: slotList.find((item) => item.fat !== null)?.fat ?? null,
    carbs: slotList.find((item) => item.carbs !== null)?.carbs ?? null,
  };
  const fallbackMeal = resolveMeal(input.defaultMeal, "breakfast");
  const prompt = buildPrompt(transcripts, fallbackMeal, slots);
  const systemMessage: ChatMessage = {
    role: "system",
    content:
      "You extract food diary commands. Reply with JSON that matches the schema. No markdown.",
  };

  const tryFallback = (): ParseVoiceIntentResult => {
    const parsed = fallbackParse(primary, fallbackMeal);
    if (!parsed) return { ok: false, error: "parse_failed" };
    return { ok: true, data: parsed };
  };

  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    input.log.warn({}, "OPENROUTER_API_KEY is not set; using local voice parse");
    return tryFallback();
  }

  let lastError: unknown = null;

  for (const model of input.models) {
    const messages: ChatMessage[] = [
      systemMessage,
      { role: "user", content: prompt },
    ];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await callOpenRouter(model, apiKey, messages);
        if (!result.ok) {
          input.log.warn(
            { model, status: result.status, body: result.body },
            "Voice model request failed",
          );
          lastError = { status: result.status };
          if (result.status === 400 || result.status === 401 || result.status === 403) {
            break;
          }
          break;
        }

        input.log.info({ model, text: result.text }, "Voice AI response");
        const jsonText = extractJsonObject(result.text);
        if (!jsonText) {
          lastError = "no_json";
          messages.push({ role: "assistant", content: result.text });
          messages.push({
            role: "user",
            content: "Your previous reply was not valid JSON. Return only the schema object.",
          });
          continue;
        }

        let raw: unknown;
        try {
          raw = JSON.parse(jsonText);
        } catch {
          lastError = "invalid_json";
          messages.push({ role: "assistant", content: result.text });
          messages.push({
            role: "user",
            content: "Your previous reply was invalid JSON. Return only the schema object.",
          });
          continue;
        }

        const validated = llmVoiceIntentSchema.safeParse(raw);
        if (!validated.success) {
          lastError = "schema";
          messages.push({ role: "assistant", content: result.text });
          messages.push({
            role: "user",
            content: `Validation failed: ${formatSchemaIssues(validated.error)}. Fix and return JSON only.`,
          });
          continue;
        }

        const parsed = validated.data;
        if (parsed.intent !== "add_entry" || !parsed.productName) {
          return { ok: false, error: "parse_failed" };
        }

        let matchedProduct: MatchedProduct | null = null;
        try {
          matchedProduct = await findUniqueCatalogMatch(input.userId, parsed.productName);
        } catch (err) {
          input.log.warn({ err }, "Voice catalog match failed");
        }

        return {
          ok: true,
          data: toResponse(parsed, fallbackMeal, slots, matchedProduct),
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          input.log.warn({ model }, "Voice model request timeout");
        } else {
          input.log.warn({ model, err }, "Voice model network error");
        }
        lastError = err;
        break;
      }
    }
  }

  input.log.error({ lastError }, "Voice parse failed; using local fallback");
  return tryFallback();
}
