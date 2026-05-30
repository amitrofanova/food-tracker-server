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
        `Extract from the user message: product name, weight in grams (integer), meal type.\n` +
        `Meal type must be one of: breakfast, lunch, dinner, snack.\n` +
        `Russian meal words: завтрак=breakfast, обед=lunch, ужин=dinner, перекус=snack.\n` +
        `If meal is not mentioned, use "${fallbackMeal}". If weight is not mentioned, use 100.\n` +
        `productName must be in nominative case (именительный падеж). ` +
        `Examples: "фисташек"→"фисташки", "творога"→"творог", "сыра"→"сыр", "курицы"→"курица".\n` +
        `Return ONLY valid JSON with no extra text: {"productName": "...", "weight": 100, "meal": "breakfast"}\n` +
        `User message: "${transcript.trim()}"`;

      const res = await fetch(`https://openrouter.ai/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemma-4-31b-it:free",
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
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        fastify.log.error({ status: res.status, body }, "OpenRouter API error");
        if (res.status === 429) {
          return reply
            .status(429)
            .send({ error: "AI quota exceeded, try again later" });
        }
        return reply.status(502).send({ error: "AI service error" });
      }

      const data = (await res.json()) as any;
      const message = data.choices?.[0]?.message ?? {};
      // Gemma thinking mode may put output in `reasoning` with empty `content`
      const text: string = message.content || message.reasoning || "";
      fastify.log.info({ text, fullData: JSON.stringify(data) }, "AI response");

      // Strip markdown code fences if model wraps output in ```json ... ```
      const stripped = text
        .replace(/```(?:json)?\s*/gi, "")
        .replace(/```/g, "");
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        fastify.log.error({ text }, "No JSON in AI response");
        return reply
          .status(502)
          .send({ error: "Could not parse AI response", raw: text });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        fastify.log.error({ json: jsonMatch[0] }, "Invalid JSON from AI");
        return reply.status(502).send({ error: "Could not parse AI response" });
      }

      const rawMeal = String(parsed.meal ?? "")
        .toLowerCase()
        .trim();
      const meal: MealType = MEAL_ALIASES[rawMeal] ?? fallbackMeal;

      return reply.send({
        productName: String(parsed.productName ?? "").trim(),
        weight: Math.max(1, Math.round(Number(parsed.weight) || 100)),
        meal,
      });
    },
  );
}
