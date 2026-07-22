// src/routes/voiceRoutes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

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

interface ParseBody {
  transcript: string;
  defaultMeal?: string;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.max(0, Math.round(n));
}

function fallbackParse(transcript: string, fallbackMeal: MealType) {
  const text = transcript.trim();
  const lower = text.toLowerCase();

  // Extract meal type
  const mealFromText =
    MEAL_ALIASES[
      lower.match(
        /\b(завтрак|обед|ужин|перекус|breakfast|lunch|dinner|snack)\b/,
      )?.[1] ?? ""
    ] ?? fallbackMeal;

  // Extract weight in grams: "100 г", "100г", "100g"
  const weightMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:г|гр|grams?|g)\b/);

  // Extract calories: "250 ккал", "250 cal"
  const caloriesMatch = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:ккал|kilocalories|calories|kcal|cal)\b/,
  );

  // Extract macros
  const proteinMatch = lower.match(
    /(?:белк|protein)[:\s]*(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)?\b/,
  );
  const fatMatch = lower.match(
    /(?:жир|fat)[:\s]*(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)?\b/,
  );
  const carbsMatch = lower.match(
    /(?:углевод|carbs?)[:\s]*(\d+(?:[.,]\d+)?)\s*(?:г|гр|g)?\b/,
  );

  // Extract product name: remove meal words, numbers+units, macros, imperatives, prepositions
  let productName = text
    // Remove meal words
    .replace(
      /\b(завтрак|обед|ужин|перекус|breakfast|lunch|dinner|snack)\b/gi,
      "",
    )
    // Remove common command verbs
    .replace(/\b(добавь|add|положи|возьми|возьми|take|eat|съешь)\b/gi, "")
    // Remove weight/volume units with numbers
    .replace(
      /\d+(?:[.,]\d+)?\s*(?:г|гр|мл|л|гр|grm|ml|l|cup|tsp|tbsp|oz|lb)\b/gi,
      "",
    )
    // Remove calories
    .replace(/\d+(?:[.,]\d+)?\s*(?:ккал|kcal|cal|калории)\b/gi, "")
    // Remove macro labels with numbers
    .replace(
      /(?:белк|protein|жир|fat|углевод|carbs?)[:\s]*\d+(?:[.,]\d+)?\s*(?:г|гр|g)?\b/gi,
      "",
    )
    // Remove common prepositions and particles
    .replace(/\b(к|к\s+|на|в|о|по|из|у|и|или|или|то)\b/gi, " ")
    // Clean up dashes
    .replace(/[—–\-–]/g, " ")
    // Remove extra whitespace
    .replace(/\s+/g, " ")
    .trim()
    // Remove leading/trailing article-like words
    .replace(/^\s*(а|в|на|и)\s+/i, "")
    .replace(/\s+(к|на)\s*$/i, "");

  // If product name is empty after cleaning, try to extract noun phrases more intelligently
  if (!productName) {
    // Try to find a word that looks like a food item (Russian: nouns in certain cases)
    const words = lower.split(/\s+/);
    const foodWords = words.filter(
      (w) =>
        w.length > 2 &&
        !/^\d+/.test(w) && // not starting with number
        ![
          "завтрак",
          "обед",
          "ужин",
          "перекус",
          "breakfast",
          "lunch",
          "dinner",
          "snack",
          "к",
          "на",
          "в",
          "и",
          "или",
        ].includes(w),
    );
    productName = foodWords.join(" ");
  }

  return {
    productName: productName || "неизвестный продукт",
    weight: parseNullableNumber(weightMatch?.[1]),
    meal: mealFromText,
    calories: parseNullableNumber(caloriesMatch?.[1]),
    protein: parseNullableNumber(proteinMatch?.[1]),
    fat: parseNullableNumber(fatMatch?.[1]),
    carbs: parseNullableNumber(carbsMatch?.[1]),
  };
}

export default async function voiceRoutes(fastify: FastifyInstance) {
  const MODEL_LIST = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];

  fastify.post(
    "/parse",
    async (
      request: FastifyRequest<{ Body: ParseBody }>,
      reply: FastifyReply,
    ) => {
      const { transcript, defaultMeal } = request.body;
      const fallbackMeal: MealType =
        MEAL_ALIASES[String(defaultMeal ?? "").toLowerCase()] ?? "breakfast";

      if (
        !transcript ||
        typeof transcript !== "string" ||
        transcript.trim().length === 0
      ) {
        return reply.status(400).send({ error: "transcript is required" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return reply.send(fallbackParse(transcript, fallbackMeal));
      }

      const prompt =
        `Extract from the user message: product name, weight in grams (integer), meal type, and optionally calories and macronutrients.\n` +
        `Meal type must be one of: breakfast, lunch, dinner, snack.\n` +
        `Russian meal words: завтрак=breakfast, обед=lunch, ужин=dinner, перекус=snack.\n` +
        `If meal is not mentioned, use "${fallbackMeal}". If weight is not mentioned, use null.\n` +
        `productName must be in nominative case (именительный падеж). ` +
        `Examples: "фисташек"→"фисташки", "творога"→"творог", "сыра"→"сыр", "курицы"→"курица".\n` +
        `If the user mentions calories (kcal, cal, ккал, калории) or macronutrients ` +
        `(protein/белки, fat/жиры, carbs/углеводы), extract them as total values for the given portion. Use null if not mentioned.\n` +
        `Return ONLY valid JSON with no extra text: {"productName": "...", "weight": null, "meal": "breakfast", "calories": null, "protein": null, "fat": null, "carbs": null}\n` +
        `User message: "${transcript.trim()}"`;

      let lastError: any = null;

      for (const model of MODEL_LIST) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: prompt,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0,
                  maxOutputTokens: 200,
                },
                systemInstruction: {
                  parts: [
                    {
                      text: "You are a JSON extractor. Always respond with valid JSON only, no markdown, no explanation.",
                    },
                  ],
                },
              }),
              signal: controller.signal,
            },
          );

          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            const candidates = data.candidates ?? [];
            if (candidates.length === 0) {
              fastify.log.warn({ model }, "No candidates in Gemini response");
              continue;
            }

            const text: string = candidates[0]?.content?.parts?.[0]?.text || "";

            fastify.log.debug({ model, responseText: text }, "AI raw response");

            if (!text) {
              fastify.log.warn({ model }, "Empty AI response");
              continue;
            }

            // Strip markdown code fences
            const stripped = text
              .replace(/```(?:json)?\s*/gi, "")
              .replace(/```/g, "")
              .trim();

            let parsed: any;
            try {
              // Try direct JSON parse first
              parsed = JSON.parse(stripped);
            } catch {
              // Try to extract JSON object from text
              const jsonMatch = stripped.match(/\{[\s\S]*\}/);
              if (!jsonMatch) {
                fastify.log.warn(
                  { model, responseText: stripped },
                  "No JSON found in response",
                );
                continue;
              }
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch {
                fastify.log.warn(
                  { model, json: jsonMatch[0] },
                  "Failed to parse JSON",
                );
                continue;
              }
            }

            // Validate and normalize parsed response
            if (!parsed.productName || typeof parsed.productName !== "string") {
              fastify.log.warn(
                { model, parsed },
                "Missing or invalid productName",
              );
              continue;
            }

            const rawMeal = String(parsed.meal ?? "")
              .toLowerCase()
              .trim();
            const meal: MealType = MEAL_ALIASES[rawMeal] ?? fallbackMeal;

            const parsedWeight =
              parsed.weight !== null && parsed.weight !== undefined
                ? Math.max(1, Math.round(Number(parsed.weight) || 1))
                : null;

            fastify.log.info(
              { model, productName: parsed.productName, weight: parsedWeight },
              "AI parsing succeeded",
            );

            return reply.send({
              productName: String(parsed.productName).trim(),
              weight: parsedWeight,
              meal,
              calories: parseNullableNumber(parsed.calories),
              protein: parseNullableNumber(parsed.protein),
              fat: parseNullableNumber(parsed.fat),
              carbs: parseNullableNumber(parsed.carbs),
            });
          }

          // Non-OK response → try next model
          const resBody = await res.text().catch(() => "");
          fastify.log.warn(
            { model, status: res.status, body: resBody.substring(0, 200) },
            "Gemini returned error, trying next model",
          );
          lastError = { status: res.status, body: resBody };

          // Give up on permanent auth/rate errors
          if (res.status === 401 || res.status === 403 || res.status === 429) {
            fastify.log.error(
              { status: res.status },
              "Auth/rate error from Gemini, stopping",
            );
            break;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            fastify.log.warn({ model }, "Model request timeout");
          } else {
            fastify.log.warn(
              {
                model,
                error: err instanceof Error ? err.message : String(err),
              },
              "Network error, trying next model",
            );
          }
          lastError = err;
        }
      }

      fastify.log.error({ lastError }, "All models failed");
      return reply.send({
        ...fallbackParse(transcript, fallbackMeal),
        warning:
          "AI models are currently unavailable; used local fallback parsing.",
      });
    },
  );
}
