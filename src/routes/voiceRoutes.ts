import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/authMiddleware";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_ALIASES: Record<string, MealType> = {
  breakfast: "breakfast",
  завтрак: "breakfast",
  lunch: "lunch",
  обед: "lunch",
  dinner: "dinner",
  ужин: "dinner",
  snack: "snack",
  перекус: "snack",
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const VOICE_RATE_MAX = 20;
const VOICE_RATE_WINDOW_MS = 15 * 60 * 1000;

interface ParseBody {
  transcript: string;
  defaultMeal?: string;
}

interface VoiceParseResult {
  productName: string;
  weight: number | null;
  meal: MealType;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

function resolveModels(): string[] {
  const extras = (process.env.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  return [...new Set([primary, ...extras])];
}

function buildPrompt(transcript: string, fallbackMeal: MealType): string {
  return (
    `Extract from the user message: product name, weight in grams (integer), meal type, and optionally calories and macronutrients.\n` +
    `Meal type must be one of: breakfast, lunch, dinner, snack.\n` +
    `Russian meal words: завтрак=breakfast, обед=lunch, ужин=dinner, перекус=snack.\n` +
    `If meal is not mentioned, use "${fallbackMeal}". If weight is not mentioned, use null.\n` +
    `productName must be in nominative case (именительный падеж). ` +
    `Examples: "фисташек"→"фисташки", "творога"→"творог", "сыра"→"сыр", "курицы"→"курица".\n` +
    `If the user specifies fat content / жирность (e.g. "творог 9%", "творог 5%", ` +
    `"сметана 20%", "сметана 15%", "пятипроцентный творог", "девять процентов"), ` +
    `include it in productName as "творог 9%", "сметана 20%". ` +
    `Do not invent a percentage when none was said.\n` +
    `Dairy fat percentage is NOT grams of fat. Leave fat, calories, protein, and carbs null ` +
    `unless the user stated those numbers (ккал, калории, белки, жиры in grams, углеводы).\n` +
    `If the user mentions calories (kcal, cal, ккал, калории) or macronutrients ` +
    `(protein/белки, fat/жиры, carbs/углеводы), extract them as total values for the given portion. Use null if not mentioned.\n` +
    `Return ONLY valid JSON with no extra text: {"productName": "...", "weight": null, "meal": "breakfast", "calories": null, "protein": null, "fat": null, "carbs": null}\n` +
    `User message: "${transcript.trim()}"`
  );
}

function parseNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.max(0, Math.round(n));
}

function normalizeParsed(
  parsed: Record<string, unknown>,
  fallbackMeal: MealType,
): VoiceParseResult {
  const rawMeal = String(parsed.meal ?? "")
    .toLowerCase()
    .trim();
  const meal: MealType = MEAL_ALIASES[rawMeal] ?? fallbackMeal;
  const parsedWeight =
    parsed.weight !== null && parsed.weight !== undefined
      ? Math.max(1, Math.round(Number(parsed.weight) || 1))
      : null;

  return {
    productName: String(parsed.productName ?? "").trim(),
    weight: parsedWeight,
    meal,
    calories: parseNullableNumber(parsed.calories),
    protein: parseNullableNumber(parsed.protein),
    fat: parseNullableNumber(parsed.fat),
    carbs: parseNullableNumber(parsed.carbs),
  };
}

function extractJsonObject(text: string): string | null {
  const stripped = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0] ?? null;
}

async function callOpenRouter(
  model: string,
  prompt: string,
  apiKey: string,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a JSON extractor. Always respond with valid JSON only, no markdown, no explanation.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 250,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, body };
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};
  const text: string = message.content || message.reasoning || "";
  return { ok: true, text };
}

const voiceHits = new Map<number, number[]>();

function allowVoiceRequest(userId: number): boolean {
  const now = Date.now();
  const windowStart = now - VOICE_RATE_WINDOW_MS;
  const hits = (voiceHits.get(userId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= VOICE_RATE_MAX) {
    voiceHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  voiceHits.set(userId, hits);
  return true;
}

export default async function voiceRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.addHook("preHandler", async (request, reply) => {
    const userId = request.user?.id;
    if (userId == null) return;
    if (!allowVoiceRequest(userId)) {
      return reply.status(429).send({ error: "voice_rate_limited" });
    }
  });

  const models = resolveModels();

  fastify.post(
    "/parse",
    async (
      request: FastifyRequest<{ Body: ParseBody }>,
      reply: FastifyReply,
    ) => {
      const { transcript, defaultMeal } = request.body ?? {};
      const fallbackMeal: MealType =
        MEAL_ALIASES[String(defaultMeal ?? "").toLowerCase()] ?? "breakfast";

      if (
        !transcript ||
        typeof transcript !== "string" ||
        transcript.trim().length === 0
      ) {
        return reply.status(400).send({ error: "transcript_required" });
      }

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: "voice_unconfigured" });
      }

      const prompt = buildPrompt(transcript, fallbackMeal);
      let lastError: unknown = null;

      for (const model of models) {
        try {
          const result = await callOpenRouter(model, prompt, apiKey);

          if (!result.ok) {
            fastify.log.warn(
              { model, status: result.status, body: result.body },
              "Voice model request failed",
            );
            lastError = { status: result.status };
            if (result.status === 400 || result.status === 401 || result.status === 403) {
              break;
            }
            continue;
          }

          fastify.log.info({ model, text: result.text }, "Voice AI response");

          const jsonText = extractJsonObject(result.text);
          if (!jsonText) {
            fastify.log.error({ model, text: result.text }, "No JSON in AI response");
            lastError = "no_json";
            continue;
          }

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            fastify.log.error({ model, json: jsonText }, "Invalid JSON from AI");
            lastError = "invalid_json";
            continue;
          }

          return reply.send(normalizeParsed(parsed, fallbackMeal));
        } catch (err) {
          fastify.log.warn({ model, err }, "Voice model network error");
          lastError = err;
        }
      }

      fastify.log.error({ lastError }, "Voice parse failed");
      return reply.status(502).send({ error: "voice_unavailable" });
    },
  );
}
