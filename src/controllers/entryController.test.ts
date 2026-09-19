import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    customProduct: {
      update: vi.fn(),
    },
    diaryEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { createEntry, getEntriesByDate } from "./entryController";
import { prisma } from "../lib/prisma";

const ownUserId = 1;
const otherUserId = 2;

const tvorogA = {
  date: "2026-09-18",
  productId: "custom_user1_tvorog",
  productName: "Творог",
  mealType: "breakfast",
  weight: 150,
  calories: 100,
  protein: 16,
  fat: 5,
  carbs: 3,
};

const tvorogB = {
  ...tvorogA,
  productId: "custom_user2_tvorog",
  calories: 220,
  protein: 18,
  fat: 10,
  carbs: 4,
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

function mockGetRequest(userId: number, date = "2026-09-18") {
  return {
    user: { id: userId },
    query: { date },
  } as FastifyRequest<{ Querystring: { date?: string } }>;
}

function entryRow(
  body: typeof tvorogA,
  userId: number,
  id: number,
): {
  id: number;
  date: Date;
  weight: number;
  mealType: string;
  userId: number;
  productId: string | null;
  productName: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  createdAt: Date;
} {
  return {
    id,
    date: new Date("2026-09-18T00:00:00.000Z"),
    weight: body.weight,
    mealType: "BREAKFAST",
    userId,
    productId: body.productId,
    productName: body.productName,
    calories: body.calories,
    protein: body.protein,
    fat: body.fat,
    carbs: body.carbs,
    createdAt: new Date("2026-09-18T12:00:00.000Z"),
  };
}

describe("createEntry snapshot identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores POST calories as per 100g on the entry and does not upsert Product", async () => {
    const entry = entryRow(
      {
        date: "2026-09-18",
        productId: "offline-oats",
        productName: "Овсянка",
        mealType: "breakfast",
        weight: 150,
        calories: 200,
        protein: 13,
        fat: 7,
        carbs: 66,
      },
      ownUserId,
      5,
    );
    vi.mocked(prisma.diaryEntry.create).mockResolvedValue(entry as never);

    const reply = mockReply();
    await createEntry(
      mockRequest({
        date: "2026-09-18",
        productId: "offline-oats",
        productName: "Овсянка",
        mealType: "breakfast",
        weight: 150,
        calories: 200,
        protein: 13,
        fat: 7,
        carbs: 66,
      }),
      reply as unknown as FastifyReply,
    );

    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith({
      data: {
        date: new Date("2026-09-18"),
        weight: 150,
        mealType: "BREAKFAST",
        userId: ownUserId,
        productId: "offline-oats",
        productName: "Овсянка",
        calories: 200,
        protein: 13,
        fat: 7,
        carbs: 66,
      },
    });
    expect(reply.payload).toEqual(
      expect.objectContaining({
        productId: "offline-oats",
        productName: "Овсянка",
        weight: 150,
        calories: 200,
        protein: 13,
        fat: 7,
        carbs: 66,
      }),
    );
  });

  it("isolates two users with the same product name and different macros", async () => {
    const rowA = entryRow(tvorogA, ownUserId, 1);
    const rowB = entryRow(tvorogB, otherUserId, 2);
    vi.mocked(prisma.diaryEntry.create)
      .mockResolvedValueOnce(rowA as never)
      .mockResolvedValueOnce(rowB as never);

    const replyA = mockReply();
    const replyB = mockReply();
    await createEntry(mockRequest(tvorogA, ownUserId), replyA as unknown as FastifyReply);
    await createEntry(mockRequest(tvorogB, otherUserId), replyB as unknown as FastifyReply);

    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.diaryEntry.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: ownUserId,
          productName: "Творог",
          calories: 100,
          productId: "custom_user1_tvorog",
        }),
      }),
    );
    expect(prisma.diaryEntry.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: otherUserId,
          productName: "Творог",
          calories: 220,
          productId: "custom_user2_tvorog",
        }),
      }),
    );
    expect(replyA.payload).toEqual(expect.objectContaining({ calories: 100, productName: "Творог" }));
    expect(replyB.payload).toEqual(expect.objectContaining({ calories: 220, productName: "Творог" }));
  });

  it("takes userId only from the token, not from the body", async () => {
    const row = entryRow(tvorogA, ownUserId, 3);
    vi.mocked(prisma.diaryEntry.create).mockResolvedValue(row as never);

    const reply = mockReply();
    await createEntry(
      mockRequest({ ...tvorogA, userId: otherUserId }, ownUserId),
      reply as unknown as FastifyReply,
    );

    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: ownUserId }),
      }),
    );
    expect(prisma.diaryEntry.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: otherUserId }),
      }),
    );
  });

  it("does not upsert Product for custom or recipe ids", async () => {
    const recipeBody = {
      date: "2026-09-18",
      productId: "recipe_salad",
      productName: "Салат",
      mealType: "lunch",
      weight: 200,
      calories: 50,
      protein: 2,
      fat: 1,
      carbs: 8,
    };
    vi.mocked(prisma.diaryEntry.create).mockResolvedValue(
      entryRow({ ...recipeBody, mealType: "breakfast" }, ownUserId, 4) as never,
    );

    const reply = mockReply();
    await createEntry(mockRequest(recipeBody), reply as unknown as FastifyReply);

    expect(prisma.product.upsert).not.toHaveBeenCalled();
    expect(prisma.diaryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "recipe_salad",
          productName: "Салат",
          calories: 50,
        }),
      }),
    );
  });
});

describe("getEntriesByDate snapshot read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the stored snapshot and does not read Product", async () => {
    const snapshot = entryRow(tvorogA, ownUserId, 1);
    vi.mocked(prisma.diaryEntry.findMany).mockResolvedValue([snapshot] as never);

    const reply = mockReply();
    await getEntriesByDate(mockGetRequest(ownUserId), reply as unknown as FastifyReply);

    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: ownUserId }),
      }),
    );
    expect(reply.payload).toEqual([
      expect.objectContaining({
        productName: "Творог",
        calories: 100,
        protein: 16,
        fat: 5,
        carbs: 3,
        weight: 150,
      }),
    ]);
  });

  it("does not drift when a custom product is later edited", async () => {
    const historical = entryRow(tvorogA, ownUserId, 1);
    vi.mocked(prisma.diaryEntry.findMany).mockResolvedValue([historical] as never);
    vi.mocked(prisma.customProduct.update).mockResolvedValue({
      ...tvorogA,
      id: "custom_user1_tvorog",
      userId: ownUserId,
      calories: 220,
      createdAt: new Date(),
    } as never);

    const reply = mockReply();
    await getEntriesByDate(mockGetRequest(ownUserId), reply as unknown as FastifyReply);

    expect(reply.payload).toEqual([
      expect.objectContaining({
        productName: "Творог",
        calories: 100,
      }),
    ]);
    expect(prisma.customProduct.update).not.toHaveBeenCalled();
  });

  it("does not return another user's entry with the same product name", async () => {
    vi.mocked(prisma.diaryEntry.findMany).mockResolvedValue([
      entryRow(tvorogA, ownUserId, 1),
    ] as never);

    const reply = mockReply();
    await getEntriesByDate(mockGetRequest(ownUserId), reply as unknown as FastifyReply);

    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: ownUserId }),
      }),
    );
    const payload = reply.payload as Array<{ userId?: number; calories: number }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(expect.objectContaining({ calories: 100 }));
    expect(payload[0]).not.toHaveProperty("userId");
  });
});
