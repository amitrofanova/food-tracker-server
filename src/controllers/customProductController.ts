import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";

interface CustomProductBody {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
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
  const body = request.body as CustomProductBody;

  const product = await prisma.customProduct.upsert({
    where: { id: body.id },
    create: {
      id: body.id,
      name: body.name,
      calories: body.calories,
      protein: body.protein,
      fat: body.fat,
      carbs: body.carbs,
      userId,
    },
    update: {
      name: body.name,
      calories: body.calories,
      protein: body.protein,
      fat: body.fat,
      carbs: body.carbs,
    },
  });
  return reply.status(201).send(product);
}

export async function deleteCustomProduct(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const { id } = request.params as { id: string };

  const existing = await prisma.customProduct.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return reply.status(404).send({ error: "Product not found" });
  }

  await prisma.customProduct.delete({ where: { id } });
  return reply.status(204).send();
}
