import type { MatchedProduct } from "./types";

function canonicalText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/(\d+)[.,](\d+)\s*%/g, "$1.$2%")
    .replace(/(\d+)\s*%/g, "$1%")
    .replace(/[^\p{L}\p{N}.%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPercentLabel(text: string): string | null {
  const match = canonicalText(text).match(/(\d+(?:\.\d+)?)%/);
  return match?.[1] ?? null;
}

function scoreName(query: string, name: string): number {
  const q = canonicalText(query);
  const n = canonicalText(name);
  if (!q || !n) return 0;

  let score = 0;
  if (n === q) score = 100;
  else if (n.startsWith(q) || q.startsWith(n)) score = 80;
  else if (n.includes(q) || q.includes(n)) score = 50;

  const queryPercent = extractPercentLabel(q);
  const namePercent = extractPercentLabel(n);
  if (queryPercent && namePercent === queryPercent) score += 25;
  else if (queryPercent && namePercent && namePercent !== queryPercent) score -= 40;
  else if (queryPercent && !namePercent) score -= 10;

  return score;
}

export function matchCatalog(
  searchQuery: string,
  items: MatchedProduct[],
): MatchedProduct | null {
  const scored = items
    .map((item) => ({ item, score: scoreName(searchQuery, item.name) }))
    .filter((entry) => entry.score >= 70)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top) return null;
  const ties = scored.filter((entry) => entry.score === top.score);
  if (ties.length !== 1) return null;
  return top.item;
}
