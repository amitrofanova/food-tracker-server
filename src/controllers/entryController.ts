// src/controllers/entryController.ts
import { prisma } from "../lib/prisma";

// Serialize an entry + product to the shape the client expects (IDiaryEntry)
function serializeEntry(
  entry: {
    id: number;
    date: Date;
    weight: number;
    mealType: string;
    userId: number;
    productId: number;
    createdAt: Date;
  },
  product: {
    id: number;
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
    calories: (product.calories * entry.weight) / 100,
    protein: (product.protein * entry.weight) / 100,
    fat: (product.fat * entry.weight) / 100,
    carbs: (product.carbs * entry.weight) / 100,
  };
}

export const createEntry = async (request: any, reply: any) => {
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
  } = request.body;
  const userId = request.user!.id;

  if (!productId && !productName) {
    return reply
      .status(400)
      .send({ error: "Either productId or productName is required" });
  }

  try {
    // 1. Если указан productId — пробуем найти существующий продукт по числовому id
    //    (для продуктов из OpenFoodFacts id — строка штрихкода, поэтому при ненахождении
    //     делаем upsert по имени, используя БЖУ из тела запроса)
    let product;
    if (productId) {
      const numericId = Number(productId);
      if (
        !isNaN(numericId) &&
        numericId > 0 &&
        numericId < Number.MAX_SAFE_INTEGER
      ) {
        product = await prisma.product.findUnique({ where: { id: numericId } });
      }
    }

    if (!product) {
      const name = productName || productId;
      product = await prisma.product.upsert({
        where: { name },
        update: {
          calories: calories ?? 0,
          protein: protein ?? 0,
          fat: fat ?? 0,
          carbs: carbs ?? 0,
        },
        create: {
          name,
          calories: calories ?? 0,
          protein: protein ?? 0,
          fat: fat ?? 0,
          carbs: carbs ?? 0,
        },
      });
    }

    // 3. Создаём запись
    const entry = await prisma.diaryEntry.create({
      data: {
        date: new Date(date), // ожидаем строку в формате ISO или YYYY-MM-DD
        weight,
        mealType: (mealType as string).toUpperCase() as any,
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

export const getEntriesByDate = async (request: any, reply: any) => {
  const { date } = request.query as { date?: string };
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

    // Добавляем вычисленные поля
    const enrichedEntries = entries.map((entry) =>
      serializeEntry(entry, entry.product),
    );

    return reply.send(enrichedEntries);
  } catch (error) {
    console.error("Get entries error:", error);
    return reply.status(500).send({ error: "Failed to fetch entries" });
  }
};

export const deleteEntry = async (request: any, reply: any) => {
  const { id } = request.params as { id: string };
  const userId = request.user!.id;

  try {
    const entry = await prisma.diaryEntry.findUnique({
      where: { id: Number(id) },
    });

    if (!entry) {
      return reply.status(404).send({ error: "Entry not found" });
    }

    if (entry.userId !== userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await prisma.diaryEntry.delete({ where: { id: Number(id) } });
    return reply.status(204).send();
  } catch (error) {
    console.error("Delete entry error:", error);
    return reply.status(500).send({ error: "Failed to delete entry" });
  }
};
