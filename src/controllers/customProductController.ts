import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { customProductSchema, parseWithSchema } from "../lib/validation";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

export async function getCustomProducts(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const products = await prisma.customProduct.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return reply.send(products);
}

export async function upsertCustomProduct(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const parsed = parseWithSchema(customProductSchema, request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }
  const body = parsed.data;

  const existing = await prisma.customProduct.findUnique({
    where: { id: body.id },
  });

  if (existing && existing.userId !== userId) {
    return reply.status(404).send({ error: "Product not found" });
  }

  try {
    if (existing) {
      const product = await prisma.customProduct.update({
        where: { id: body.id },
        data: {
          name: body.name,
          calories: body.calories,
          protein: body.protein,
          fat: body.fat,
          carbs: body.carbs,
        },
      });
      return reply.status(201).send(product);
    }

    const product = await prisma.customProduct.create({
      data: {
        id: body.id,
        name: body.name,
        calories: body.calories,
        protein: body.protein,
        fat: body.fat,
        carbs: body.carbs,
        userId,
      },
    });
    return reply.status(201).send(product);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return reply.status(409).send({ error: "Product already exists" });
    }
    throw error;
  }
}

export async function deleteCustomProduct(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const { id } = request.params;

  const existing = await prisma.customProduct.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return reply.status(404).send({ error: "Product not found" });
  }

  await prisma.customProduct.delete({ where: { id } });
  return reply.status(204).send();
}
