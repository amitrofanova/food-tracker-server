import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import {
  collectTranscripts,
  parseVoiceIntent,
  resolveMeal,
  resolveModels,
} from "../lib/voice";

interface ParseBody {
  transcript?: string;
  transcripts?: string[];
  defaultMeal?: string;
}

const VOICE_RATE_MAX = 20;
const VOICE_RATE_WINDOW_MS = 15 * 60 * 1000;

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
      const userId = request.user?.id;
      if (userId == null) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body ?? {};
      const transcripts = collectTranscripts(body);
      const fallbackMeal = resolveMeal(body.defaultMeal, "breakfast");

      const result = await parseVoiceIntent({
        transcripts,
        defaultMeal: fallbackMeal,
        userId,
        apiKey: process.env.OPENROUTER_API_KEY,
        models,
        log: fastify.log,
      });

      if (!result.ok) {
        const status = result.error === "transcript_required" ? 400 : 422;
        return reply.status(status).send({ error: result.error });
      }

      return reply.send(result.data);
    },
  );
}
