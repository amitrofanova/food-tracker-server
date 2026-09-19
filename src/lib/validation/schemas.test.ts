import { describe, expect, it } from "vitest";
import { parseWithSchema } from "./parse";
import {
  createEntrySchema,
  customProductSchema,
  productSchema,
  recipeSchema,
  updateMeSchema,
} from "./schemas";

const validCustomProduct = {
  id: "custom_1",
  name: "Творог",
  calories: 120,
  protein: 16,
  fat: 5,
  carbs: 3,
};

const validEntry = {
  date: "2026-09-18",
  productName: "Творог",
  mealType: "breakfast",
  weight: 150,
  calories: 120,
  protein: 16,
  fat: 5,
  carbs: 3,
};

describe("updateMeSchema", () => {
  it("accepts an integer calorieBudget or null", () => {
    expect(parseWithSchema(updateMeSchema, { calorieBudget: 2000 })).toEqual({
      data: { calorieBudget: 2000 },
    });
    expect(parseWithSchema(updateMeSchema, { calorieBudget: null })).toEqual({
      data: { calorieBudget: null },
    });
  });

  it("rejects a string or NaN calorieBudget", () => {
    const asString = parseWithSchema(updateMeSchema, { calorieBudget: "2000" });
    expect("error" in asString).toBe(true);

    const asNaN = parseWithSchema(updateMeSchema, { calorieBudget: Number.NaN });
    expect("error" in asNaN).toBe(true);
  });
});

describe("createEntrySchema", () => {
  it("accepts a valid entry", () => {
    const parsed = parseWithSchema(createEntrySchema, validEntry);
    expect("data" in parsed).toBe(true);
  });

  it("rejects weight <= 0", () => {
    const parsed = parseWithSchema(createEntrySchema, { ...validEntry, weight: 0 });
    expect("error" in parsed).toBe(true);
    if ("error" in parsed) {
      expect(parsed.error.toLowerCase()).toContain("weight");
    }
  });

  it("treats empty productId as missing when productName is present", () => {
    const parsed = parseWithSchema(createEntrySchema, {
      ...validEntry,
      productId: "",
    });
    expect("data" in parsed).toBe(true);
    if ("data" in parsed) {
      expect(parsed.data.productId).toBeUndefined();
    }
  });

  it("rejects a missing productName even when productId is set", () => {
    const parsed = parseWithSchema(createEntrySchema, {
      date: "2026-09-18",
      productId: "custom_1",
      mealType: "breakfast",
      weight: 150,
      calories: 120,
      protein: 16,
      fat: 5,
      carbs: 3,
    });
    expect("error" in parsed).toBe(true);
  });

  it("rejects missing per-100g macros", () => {
    const { calories: _calories, ...withoutCalories } = validEntry;
    const parsed = parseWithSchema(createEntrySchema, withoutCalories);
    expect("error" in parsed).toBe(true);
  });
});

describe("customProductSchema", () => {
  it("rejects non-finite or negative macros", () => {
    expect("error" in parseWithSchema(customProductSchema, {
      ...validCustomProduct,
      calories: -1,
    })).toBe(true);
    expect("error" in parseWithSchema(customProductSchema, {
      ...validCustomProduct,
      protein: Number.POSITIVE_INFINITY,
    })).toBe(true);
  });

  it("accepts finite macros >= 0", () => {
    expect("data" in parseWithSchema(customProductSchema, validCustomProduct)).toBe(
      true,
    );
  });
});

describe("productSchema and recipeSchema", () => {
  it("rejects a blank product name", () => {
    const parsed = parseWithSchema(productSchema, {
      name: "  ",
      calories: 1,
      protein: 1,
      fat: 1,
      carbs: 1,
    });
    expect("error" in parsed).toBe(true);
  });

  it("accepts a recipe with ingredients", () => {
    const parsed = parseWithSchema(recipeSchema, {
      id: "recipe_1",
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
    });
    expect("data" in parsed).toBe(true);
  });
});
