import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../lib/prisma", () => ({
  prisma: {
    customProduct: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { upsertCustomProduct } from "./customProductController";
import { prisma } from "../lib/prisma";

const ownUserId = 1;
const validBody = {
  id: "custom_shared_id",
  name: "Творог",
  calories: 120,
  protein: 16,
  fat: 5,
  carbs: 3,
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

describe("upsertCustomProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 and does not update a custom product owned by another user", async () => {
    vi.mocked(prisma.customProduct.findUnique).mockResolvedValue({
      id: validBody.id,
      name: "Чужой продукт",
      calories: 1,
      protein: 1,
      fat: 1,
      carbs: 1,
      userId: 99,
      createdAt: new Date(),
    });

    const reply = mockReply();
    await upsertCustomProduct(mockRequest(validBody), reply as unknown as FastifyReply);

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "Product not found" });
    expect(prisma.customProduct.update).not.toHaveBeenCalled();
    expect(prisma.customProduct.create).not.toHaveBeenCalled();
  });

  it("updates an existing custom product owned by the current user", async () => {
    const existing = {
      ...validBody,
      userId: ownUserId,
      createdAt: new Date(),
    };
    const updated = { ...existing, name: validBody.name };
    vi.mocked(prisma.customProduct.findUnique).mockResolvedValue(existing);
    vi.mocked(prisma.customProduct.update).mockResolvedValue(updated);

    const reply = mockReply();
    await upsertCustomProduct(mockRequest(validBody), reply as unknown as FastifyReply);

    expect(prisma.customProduct.update).toHaveBeenCalledWith({
      where: { id: validBody.id },
      data: {
        name: validBody.name,
        calories: validBody.calories,
        protein: validBody.protein,
        fat: validBody.fat,
        carbs: validBody.carbs,
      },
    });
    expect(prisma.customProduct.create).not.toHaveBeenCalled();
    expect(reply.statusCode).toBe(201);
    expect(reply.payload).toEqual(updated);
  });

  it("creates a custom product when the id is unused", async () => {
    const created = {
      ...validBody,
      userId: ownUserId,
      createdAt: new Date(),
    };
    vi.mocked(prisma.customProduct.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.customProduct.create).mockResolvedValue(created);

    const reply = mockReply();
    await upsertCustomProduct(mockRequest(validBody), reply as unknown as FastifyReply);

    expect(prisma.customProduct.create).toHaveBeenCalledWith({
      data: {
        id: validBody.id,
        name: validBody.name,
        calories: validBody.calories,
        protein: validBody.protein,
        fat: validBody.fat,
        carbs: validBody.carbs,
        userId: ownUserId,
      },
    });
    expect(reply.statusCode).toBe(201);
  });

  it("returns 400 for invalid macros", async () => {
    const reply = mockReply();
    await upsertCustomProduct(
      mockRequest({ ...validBody, calories: -5 }),
      reply as unknown as FastifyReply,
    );

    expect(reply.statusCode).toBe(400);
    expect(prisma.customProduct.findUnique).not.toHaveBeenCalled();
  });
});
