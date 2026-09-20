import { describe, expect, it } from "vitest";
import { llmVoiceIntentSchema } from "./schema";

describe("llmVoiceIntentSchema", () => {
  it("accepts unknown without a product", () => {
    const parsed = llmVoiceIntentSchema.safeParse({
      intent: "unknown",
      productName: null,
      weightGrams: null,
      meal: null,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects add_entry without a product name", () => {
    const parsed = llmVoiceIntentSchema.safeParse({
      intent: "add_entry",
      productName: "  ",
      weightGrams: 70,
      meal: "snack",
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps dairy percent in the name and fat as a macro", () => {
    const parsed = llmVoiceIntentSchema.safeParse({
      intent: "add_entry",
      productName: "творог 9%",
      weightGrams: 70,
      meal: "snack",
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.productName).toBe("творог 9%");
      expect(parsed.data.fat).toBeNull();
    }
  });
});
