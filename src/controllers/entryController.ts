import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createEntrySchema,
  parseWithSchema,
  updateEntrySchema,
} from "../lib/validation";

function serializeEntry(
  entry: {
    id: number;
    date: Date;
    weight: number;
    mealType: string;
    userId: number;
    productId: bigint;
    createdAt: Date;
  },
  product: {
    id: bigint;
    name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  },
) {
  return {
    id: String(entry.id),
    date: entry.date.toISOString().slice(0, 10),
    productId: String(entry.productId),
    productName: product.name,
    mealType: entry.mealType.toLowerCase(),
    weight: entry.weight,
    // КБЖУ в API — всегда на 100 г (как в Product). Порцию считает клиент.
    calories: Math.round(product.calories),
    protein: Math.round(product.protein),
    fat: Math.round(product.fat),
    carbs: Math.round(product.carbs),
  };
}

function parseEntryId(id: string): number | null {
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return null;
  }
  return entryId;
}

export const createEntry = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const parsed = parseWithSchema(createEntrySchema, request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }

  const {
    date,
    productId,
    productName,
    mealType,
    weight,
    calories,
    protein,
    fat,
    carbs,
  } = parsed.data;
  const userId = request.user!.id;

  try {
    // 1. Если указан productId — пробуем найти существующий продукт по числовому id
    //    (для продуктов из OpenFoodFacts id — строка штрихкода, поэтому при ненахождении
    //     делаем upsert по имени, используя БЖУ из тела запроса)
    let product;
    if (productId) {
      const numericId = Number(productId);
      if (
        !Number.isNaN(numericId) &&
        numericId > 0 &&
        numericId < Number.MAX_SAFE_INTEGER
      ) {
        product = await prisma.product.findUnique({ where: { id: numericId } });
      }
    }

    if (!product) {
      const name = productName ?? productId;
      if (!name) {
        return reply
          .status(400)
          .send({ error: "Either productId or productName is required" });
      }

      // POST calories/protein/fat/carbs = per 100g, stored on Product as-is.
      const raw100g = {
        calories: calories ?? 0,
        protein: protein ?? 0,
        fat: fat ?? 0,
        carbs: carbs ?? 0,
      };

      product = await prisma.product.upsert({
        where: { name },
        update: {},
        create: {
          name,
          ...raw100g,
        },
      });
    }

    // 3. Создаём запись
    const entry = await prisma.diaryEntry.create({
      data: {
        date: new Date(date), // ожидаем строку в формате ISO или YYYY-MM-DD
        weight,
        mealType,
        userId,
        productId: product.id,
      },
      include: {
        product: true,
      },
    });

    // 4. Формируем ответ
    return reply.send(serializeEntry(entry, product));
  } catch (error) {
    console.error("Create entry error:", error);
    return reply.status(500).send({ error: "Failed to create entry" });
  }
};

export const getEntriesByDate = async (
  request: FastifyRequest<{ Querystring: { date?: string } }>,
  reply: FastifyReply,
) => {
  const { date } = request.query;
  const userId = request.user!.id;

  const targetDate = date ? new Date(date) : new Date();
  // Обнуляем время, чтобы выбрать весь день
  targetDate.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setDate(endOfDay.getDate() + 1);

  try {
    const entries = await prisma.diaryEntry.findMany({
      where: {
        userId,
        date: {
          gte: targetDate,
          lt: endOfDay,
        },
      },
      include: {
        product: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const enrichedEntries = entries.map((entry) =>
      serializeEntry(entry, entry.product),
    );

    return reply.send(enrichedEntries);
  } catch (error) {
    console.error("Get entries error:", error);
    return reply.status(500).send({ error: "Failed to fetch entries" });
  }
};

export const updateEntry = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const entryId = parseEntryId(request.params.id);
  const parsed = parseWithSchema(updateEntrySchema, request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }
  const { weight, mealType } = parsed.data;
  const userId = request.user!.id;

  if (entryId == null) {
    return reply.status(404).send({ error: "Entry not found" });
  }

  try {
    const entry = await prisma.diaryEntry.findUnique({
      where: { id: entryId },
      include: { product: true },
    });

    if (!entry || entry.userId !== userId) {
      return reply.status(404).send({ error: "Entry not found" });
    }

    const updated = await prisma.diaryEntry.update({
      where: { id: entryId },
      data: {
        ...(weight !== undefined ? { weight } : {}),
        ...(mealType ? { mealType } : {}),
      },
      include: { product: true },
    });

    return reply.send(serializeEntry(updated, updated.product));
  } catch (error) {
    console.error("Update entry error:", error);
    return reply.status(500).send({ error: "Failed to update entry" });
  }
};

export const deleteEntry = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const entryId = parseEntryId(request.params.id);
  const userId = request.user!.id;

  if (entryId == null) {
    return reply.status(404).send({ error: "Entry not found" });
  }

  try {
    const entry = await prisma.diaryEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry || entry.userId !== userId) {
      return reply.status(404).send({ error: "Entry not found" });
    }

    await prisma.diaryEntry.delete({ where: { id: entryId } });
    return reply.status(204).send();
  } catch (error) {
    console.error("Delete entry error:", error);
    return reply.status(500).send({ error: "Failed to delete entry" });
  }
};
