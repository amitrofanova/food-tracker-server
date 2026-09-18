import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";
import { parseWithSchema, recipeSchema } from "../lib/validation";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

export async function getRecipes(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user!.id;
  const recipes = await prisma.recipe.findMany({
    where: { userId },
    include: { ingredients: true },
    orderBy: { createdAt: "asc" },
  });
  return reply.send(recipes);
}

export async function upsertRecipe(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const parsed = parseWithSchema(recipeSchema, request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }
  const body = parsed.data;

  const existing = await prisma.recipe.findUnique({
    where: { id: body.id },
  });

  if (existing && existing.userId !== userId) {
    return reply.status(404).send({ error: "Recipe not found" });
  }

  const ingredients = {
    create: body.ingredients.map((ing) => ({
      productId: ing.productId,
      productName: ing.productName,
      weight: ing.weight,
      calories: ing.calories,
      protein: ing.protein,
      fat: ing.fat,
      carbs: ing.carbs,
    })),
  };

  try {
    if (existing) {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: body.id } });
      const recipe = await prisma.recipe.update({
        where: { id: body.id },
        data: {
          name: body.name,
          totalWeight: body.totalWeight,
          calories: body.calories,
          protein: body.protein,
          fat: body.fat,
          carbs: body.carbs,
          ingredients,
        },
        include: { ingredients: true },
      });
      return reply.send(recipe);
    }

    const recipe = await prisma.recipe.create({
      data: {
        id: body.id,
        name: body.name,
        totalWeight: body.totalWeight,
        calories: body.calories,
        protein: body.protein,
        fat: body.fat,
        carbs: body.carbs,
        userId,
        ingredients,
      },
      include: { ingredients: true },
    });
    return reply.status(201).send(recipe);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return reply.status(409).send({ error: "Recipe already exists" });
    }
    throw error;
  }
}

export async function deleteRecipe(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const { id } = request.params;

  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) {
    return reply.status(404).send({ error: "Recipe not found" });
  }

  await prisma.recipe.delete({ where: { id } });
  return reply.status(204).send();
}
