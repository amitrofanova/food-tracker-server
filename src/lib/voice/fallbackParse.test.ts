import { describe, expect, it } from "vitest";
import { fallbackParse, isMeaningfulProductName } from "./fallbackParse";

describe("fallbackParse", () => {
  it("does not treat command verbs as a product", () => {
    expect(fallbackParse("добавь к перекусу", "breakfast")).toBeNull();
    expect(isMeaningfulProductName("добавь к")).toBe(false);
  });

  it("keeps catalog fat content in the leftover product name", () => {
    const parsed = fallbackParse("добавь к перекусу 70 грамм творога 9%", "breakfast");
    expect(parsed).toMatchObject({
      intent: "add_entry",
      productName: "творога 9%",
      searchQuery: "творога 9%",
      weight: 70,
      meal: "snack",
      fat: null,
    });
  });
});
