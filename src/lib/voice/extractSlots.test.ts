import { describe, expect, it } from "vitest";
import { extractSlots } from "./extractSlots";
import { normalizeTranscript } from "./normalize";

describe("extractSlots", () => {
  it("extracts weight and meal without treating dairy % as fat grams", () => {
    const slots = extractSlots(
      normalizeTranscript("добавь к перекусу 70 грамм творога 9%"),
    );
    expect(slots).toEqual({
      meal: "snack",
      weight: 70,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
  });

  it("does not treat жирность as the fat macro", () => {
    const slots = extractSlots(normalizeTranscript("сметана жирность 20% 50 грамм"));
    expect(slots.weight).toBe(50);
    expect(slots.fat).toBeNull();
  });

  it("extracts spoken macros when they are grams or kcal", () => {
    const slots = extractSlots(
      normalizeTranscript("омлет 200 ккал белки 18 жиры 12 углеводы 4"),
    );
    expect(slots.calories).toBe(200);
    expect(slots.protein).toBe(18);
    expect(slots.fat).toBe(12);
    expect(slots.carbs).toBe(4);
  });
});
