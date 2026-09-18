import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    diaryEntry: {
      create: vi.fn(),
    },
  },
}));

import { createEntry } from "./entryController";
import { prisma } from "../lib/prisma";

const ownUserId = 1;
const body = {
  date: "2026-09-18",
  productId: "offline-oats",
  productName: "Овсянка",
  mealType: "breakfast",
  weight: 150,
  calories: 200,
  protein: 13,
  fat: 7,
  carbs: 66,
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

function mockRequest(value: unknown = body) {
  return {
    user: { id: ownUserId },
    body: value,
  } as FastifyRequest;
}

describe("createEntry nutrition units", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores POST calories as per 100g and returns them unscaled by weight", async () => {
    const product = {
      id: 11n,
      name: "Овсянка",
      calories: 200,
      protein: 13,
      fat: 7,
      carbs: 66,
    };
    const entry = {
      id: 5,
      date: new Date("2026-09-18T00:00:00.000Z"),
      weight: 150,
      mealType: "BREAKFAST",
      userId: ownUserId,
      productId: 11n,
      createdAt: new Date("2026-09-18T12:00:00.000Z"),
      product,
    };

    vi.mocked(prisma.product.upsert).mockResolvedValue(product as never);
    vi.mocked(prisma.diaryEntry.create).mockResolvedValue(entry as never);

    const reply = mockReply();
    await createEntry(mockRequest(), reply as unknown as FastifyReply);

    expect(prisma.product.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          name: "Овсянка",
          calories: 200,
          protein: 13,
          fat: 7,
          carbs: 66,
        }),
      }),
    );
    expect(reply.payload).toEqual(
      expect.objectContaining({
        weight: 150,
        calories: 200,
        protein: 13,
        fat: 7,
        carbs: 66,
      }),
    );
  });
});
