import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../lib/prisma", () => ({
  prisma: {
    recipe: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    recipeIngredient: {
      deleteMany: vi.fn(),
    },
  },
}));

import { upsertRecipe } from "./recipeController";
import { prisma } from "../lib/prisma";

const ownUserId = 1;
const validBody = {
  id: "recipe_shared_id",
  name: "Салат",
  totalWeight: 200,
  calories: 50,
  protein: 2,
  fat: 1,
  carbs: 8,
  ingredients: [
    {
      productId: "p1",
      productName: "Огурец",
      weight: 100,
      calories: 15,
      protein: 0.7,
      fat: 0.1,
      carbs: 3,
    },
  ],
};

function mockReply() {
  const reply = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(payload?: unknown) {
      reply.payload = payload;
      return reply;
    },
  };
  return reply;
}

function mockRequest(body: unknown, userId = ownUserId) {
  return {
    user: { id: userId },
    body,
  } as FastifyRequest;
}

describe("upsertRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 and does not create over another user's recipe id", async () => {
    vi.mocked(prisma.recipe.findUnique).mockResolvedValue({
      id: validBody.id,
      name: "Чужой рецепт",
      totalWeight: 1,
      calories: 1,
      protein: 1,
      fat: 1,
      carbs: 1,
      userId: 99,
      createdAt: new Date(),
    });

    const reply = mockReply();
    await upsertRecipe(mockRequest(validBody), reply as unknown as FastifyReply);

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "Recipe not found" });
    expect(prisma.recipe.create).not.toHaveBeenCalled();
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(prisma.recipeIngredient.deleteMany).not.toHaveBeenCalled();
  });
});
