import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma";

interface RecipeIngredientBody {
  productId: string;
  productName: string;
  weight: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface RecipeBody {
  id: string;
  name: string;
  totalWeight: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: RecipeIngredientBody[];
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
  const body = request.body as RecipeBody;

  // Upsert: if recipe with same id and userId exists, replace it; otherwise create
  const existing = await prisma.recipe.findFirst({
    where: { id: body.id, userId },
  });

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
        ingredients: {
          create: body.ingredients.map((ing) => ({
            productId: ing.productId,
            productName: ing.productName,
            weight: ing.weight,
            calories: ing.calories,
            protein: ing.protein,
            fat: ing.fat,
            carbs: ing.carbs,
          })),
        },
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
      ingredients: {
        create: body.ingredients.map((ing) => ({
          productId: ing.productId,
          productName: ing.productName,
          weight: ing.weight,
          calories: ing.calories,
          protein: ing.protein,
          fat: ing.fat,
          carbs: ing.carbs,
        })),
      },
    },
    include: { ingredients: true },
  });
  return reply.status(201).send(recipe);
}

export async function deleteRecipe(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user!.id;
  const { id } = request.params as { id: string };

  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) {
    return reply.status(404).send({ error: "Recipe not found" });
  }

  await prisma.recipe.delete({ where: { id } });
  return reply.status(204).send();
}
