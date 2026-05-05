import { prisma } from "../lib/prisma";

function isNonNegativeFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export const upsertProduct = async (request: any, reply: any) => {
  const body = request.body as Record<string, unknown>;
  const { name, calories, protein, fat, carbs } = body;

  if (typeof name !== "string" || !name.trim()) {
    return reply.status(400).send({ error: "name is required" });
  }

  for (const [field, val] of [
    ["calories", calories],
    ["protein", protein],
    ["fat", fat],
    ["carbs", carbs],
  ] as [string, unknown][]) {
    if (!isNonNegativeFinite(val)) {
      return reply
        .status(400)
        .send({ error: `${field} must be a non-negative number` });
    }
  }

  const macros = {
    calories: calories as number,
    protein: protein as number,
    fat: fat as number,
    carbs: carbs as number,
  };

  try {
    const product = await prisma.product.upsert({
      where: { name: name.trim() },
      update: macros,
      create: { name: name.trim(), ...macros },
    });

    return reply.send({
      id: String(product.id),
      name: product.name,
      calories: product.calories,
      protein: product.protein,
      fat: product.fat,
      carbs: product.carbs,
    });
  } catch (error) {
    console.error("Upsert product error:", error);
    return reply.status(500).send({ error: "Failed to save product" });
  }
};
