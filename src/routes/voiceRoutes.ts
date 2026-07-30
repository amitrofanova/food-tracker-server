// src/routes/voiceRoutes.ts
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

interface ParseBody {
  transcript: string;
  defaultMeal?: string;
}

export default async function voiceRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  const MODEL_LIST = [
    "openai/gpt-4o-mini",
    "google/gemma-3-12b-it",
    "meta-llama/llama-3.1-8b-instruct",
    ...(process.env.OPENROUTER_MODELS
      ? process.env.OPENROUTER_MODELS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []),
  ];

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

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return reply
          .status(503)
          .send({ error: "Voice feature not configured" });
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
          const res = await fetch(
            `https://openrouter.ai/api/v1/chat/completions`,
            {
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
                max_tokens: 150,
                thinking: { type: "disabled" },
              }),
            },
          );

          if (res.ok) {
            const data = await res.json();
            const message = data.choices?.[0]?.message ?? {};
            const text: string = message.content || message.reasoning || "";
            fastify.log.info(
              { model, text },
              "AI response from fallback chain",
            );

            // Strip markdown code fences
            const stripped = text
              .replace(/```(?:json)?\s*/gi, "")
              .replace(/```/g, "");
            const jsonMatch = stripped.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              fastify.log.error({ text }, "No JSON in AI response");
              return reply.status(502).send({
                error: "Could not parse AI response",
                raw: text,
              });
            }

            let parsed: any;
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              fastify.log.error({ json: jsonMatch[0] }, "Invalid JSON from AI");
              return reply
                .status(502)
                .send({ error: "Could not parse AI response" });
            }

            const rawMeal = String(parsed.meal ?? "")
              .toLowerCase()
              .trim();
            const meal: MealType = MEAL_ALIASES[rawMeal] ?? fallbackMeal;

            const parseNullableNumber = (v: unknown): number | null => {
              if (v === null || v === undefined) return null;
              const n = Number(v);
              return isNaN(n) ? null : Math.max(0, Math.round(n));
            };

            const parsedWeight =
              parsed.weight !== null && parsed.weight !== undefined
                ? Math.max(1, Math.round(Number(parsed.weight) || 1))
                : null;

            return reply.send({
              productName: String(parsed.productName ?? "").trim(),
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
            { model, status: res.status, body: resBody },
            "Model attempt failed, trying next",
          );
          lastError = { status: res.status, body: resBody };

          // Give up on permanent auth/request errors; 402 (credits) → try next model
          if (res.status === 403 || res.status === 400) {
            break;
          }
        } catch (err) {
          fastify.log.warn({ model, err }, "Network error, trying next model");
          lastError = err;
        }
      }

      fastify.log.error({ lastError }, "All models failed");
      return reply.status(502).send({
        error:
          "All AI models are currently unavailable. Please try again later.",
        lastError,
      });
    },
  );
}
