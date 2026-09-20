import { describe, expect, it } from "vitest";
import { matchCatalog } from "./matchCatalog";
import type { MatchedProduct } from "./types";

function item(id: string, name: string): MatchedProduct {
  return { id, name, calories: 100, protein: 10, fat: 5, carbs: 3 };
}

describe("matchCatalog", () => {
  it("returns a unique 9% match and ignores a 5% sibling", () => {
    expect(
      matchCatalog("творог 9%", [
        item("five", "Творог 5%"),
        item("nine", "Творог 9%"),
      ]),
    ).toEqual(item("nine", "Творог 9%"));
  });

  it("returns null when two products share the same name", () => {
    expect(
      matchCatalog("творог", [item("a", "Творог"), item("b", "Творог")]),
    ).toBeNull();
  });

  it("returns a single exact custom product", () => {
    expect(matchCatalog("овсянка", [item("oat", "Овсянка")])).toEqual(
      item("oat", "Овсянка"),
    );
  });
});
