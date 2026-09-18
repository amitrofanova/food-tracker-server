import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { parseWithSchema, productSchema } from "../lib/validation";

export const upsertProduct = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = parseWithSchema(productSchema, request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }
  const { name, calories, protein, fat, carbs } = parsed.data;

  const macros = { calories, protein, fat, carbs };

  try {
    const product = await prisma.product.upsert({
      where: { name },
      update: macros,
      create: { name, ...macros },
    });

    return reply.send({
      id: String(product.id),
      name: product.name,
      calories: product.calories,
      protein: product.protein,
      fat: product.fat,
      carbs: product.carbs,
    });
  } catch (error) {
    console.error("Upsert product error:", error);
    return reply.status(500).send({ error: "Failed to save product" });
  }
};
