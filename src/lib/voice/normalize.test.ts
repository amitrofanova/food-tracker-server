import { describe, expect, it } from "vitest";
import { collectTranscripts, normalizeTranscript } from "./normalize";

describe("normalizeTranscript", () => {
  it("turns number words and percent adjectives into catalog-style tokens", () => {
    expect(normalizeTranscript("добавь к перекусу 70 грамм девятипроцентного творога")).toBe(
      "добавь к перекусу 70 грамм 9% творога",
    );
    expect(normalizeTranscript("семьдесят грамм творога 9%")).toBe("70 грамм творога 9%");
    expect(normalizeTranscript("пять процентов сметана")).toBe("5% сметана");
  });

  it("parses compound Russian numbers", () => {
    expect(normalizeTranscript("сто пятьдесят грамм курицы")).toBe("150 грамм курицы");
    expect(normalizeTranscript("двести двадцать пять грамм")).toBe("225 грамм");
  });

  it("keeps ё folded and collapses spaces", () => {
    expect(normalizeTranscript("  чёрный  хлеб  ")).toBe("черный хлеб");
  });
});

describe("collectTranscripts", () => {
  it("dedupes transcript and transcripts", () => {
    expect(
      collectTranscripts({
        transcript: "творог 9%",
        transcripts: ["Творог 9%", "творог"],
      }),
    ).toEqual(["Творог 9%", "творог"]);
  });

  it("ignores empty strings", () => {
    expect(collectTranscripts({ transcript: "  ", transcripts: ["", "молоко"] })).toEqual([
      "молоко",
    ]);
  });
});
