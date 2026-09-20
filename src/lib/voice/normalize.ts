const ONES: Record<string, number> = {
  ноль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  одного: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  четырех: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  семи: 7,
  восемь: 8,
  восьми: 8,
  девять: 9,
  девяти: 9,
};

const TEENS: Record<string, number> = {
  десять: 10,
  десяти: 10,
  одиннадцать: 11,
  одиннадцати: 11,
  двенадцать: 12,
  двенадцати: 12,
  тринадцать: 13,
  тринадцати: 13,
  четырнадцать: 14,
  четырнадцати: 14,
  пятнадцать: 15,
  пятнадцати: 15,
  шестнадцать: 16,
  шестнадцати: 16,
  семнадцать: 17,
  семнадцати: 17,
  восемнадцать: 18,
  восемнадцати: 18,
  девятнадцать: 19,
  девятнадцати: 19,
};

const TENS: Record<string, number> = {
  двадцать: 20,
  двадцати: 20,
  тридцать: 30,
  тридцати: 30,
  сорок: 40,
  сорока: 40,
  пятьдесят: 50,
  пятидесяти: 50,
  шестьдесят: 60,
  шестидесяти: 60,
  семьдесят: 70,
  семидесяти: 70,
  восемьдесят: 80,
  восьмидесяти: 80,
  девяносто: 90,
  девяноста: 90,
};

const HUNDREDS: Record<string, number> = {
  сто: 100,
  ста: 100,
  двести: 200,
  двухсот: 200,
  триста: 300,
  трехсот: 300,
  четыреста: 400,
  четырехсот: 400,
  пятьсот: 500,
  пятисот: 500,
  шестьсот: 600,
  шестисот: 600,
  семьсот: 700,
  семисот: 700,
  восемьсот: 800,
  восьмисот: 800,
  девятьсот: 900,
  девятисот: 900,
};

const NUMBER_WORD = new Set([
  ...Object.keys(ONES),
  ...Object.keys(TEENS),
  ...Object.keys(TENS),
  ...Object.keys(HUNDREDS),
]);

const PERCENT_ADJECTIVES: Array<[RegExp, string]> = [
  [/полуторапроцентн\p{L}*/giu, "1.5%"],
  [/двухпроцентн\p{L}*/giu, "2%"],
  [/трехпроцентн\p{L}*/giu, "3%"],
  [/четырехпроцентн\p{L}*/giu, "4%"],
  [/пятипроцентн\p{L}*/giu, "5%"],
  [/шестипроцентн\p{L}*/giu, "6%"],
  [/девятипроцентн\p{L}*/giu, "9%"],
  [/десятипроцентн\p{L}*/giu, "10%"],
  [/пятнадцатипроцентн\p{L}*/giu, "15%"],
  [/двадцатипроцентн\p{L}*/giu, "20%"],
];

function parseNumberWordSequence(words: string[]): { value: number; consumed: number } | null {
  if (words.length === 0) return null;
  let i = 0;
  let value = 0;
  const first = words[0];
  if (!first) return null;

  const hundreds = HUNDREDS[first];
  if (hundreds !== undefined) {
    value += hundreds;
    i += 1;
  }

  const tensWord = words[i];
  if (tensWord) {
    const tens = TENS[tensWord];
    if (tens !== undefined) {
      value += tens;
      i += 1;
      const onesWord = words[i];
      if (onesWord) {
        const ones = ONES[onesWord];
        if (ones !== undefined) {
          value += ones;
          i += 1;
        }
      }
    } else {
      const teens = TEENS[tensWord];
      if (teens !== undefined) {
        value += teens;
        i += 1;
      } else {
        const ones = ONES[tensWord];
        if (ones !== undefined) {
          value += ones;
          i += 1;
        }
      }
    }
  }

  if (i === 0) return null;
  return { value, consumed: i };
}

function replaceNumberWords(text: string): string {
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;
    if (/^\s+$/.test(token)) {
      out.push(token);
      i += 1;
      continue;
    }

    const word = token.toLowerCase();
    if (!NUMBER_WORD.has(word)) {
      out.push(token);
      i += 1;
      continue;
    }

    const words: string[] = [];
    let j = i;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t === undefined) break;
      if (/^\s+$/.test(t)) {
        j += 1;
        continue;
      }
      const w = t.toLowerCase();
      if (!NUMBER_WORD.has(w)) break;
      words.push(w);
      j += 1;
    }

    const parsed = parseNumberWordSequence(words);
    if (!parsed) {
      out.push(token);
      i += 1;
      continue;
    }

    out.push(String(parsed.value));
    let consumed = 0;
    let k = i;
    while (k < tokens.length && consumed < parsed.consumed) {
      const t = tokens[k];
      if (t === undefined) break;
      if (/^\s+$/.test(t)) {
        k += 1;
        continue;
      }
      consumed += 1;
      k += 1;
    }
    i = k;
  }

  return out.join("");
}

function replacePercentAdjectives(text: string): string {
  let next = text;
  for (const [pattern, replacement] of PERCENT_ADJECTIVES) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function replacePercentPhrases(text: string): string {
  return text.replace(
    /(\d+(?:[.,]\d+)?)\s*процент(?:а|ов|е|у|ом)?(?!\p{L})/giu,
    "$1%",
  );
}

export function normalizeTranscript(text: string): string {
  let next = text.trim().toLowerCase().replaceAll("ё", "е");
  next = replacePercentAdjectives(next);
  next = replaceNumberWords(next);
  next = replacePercentPhrases(next);
  next = next.replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1%");
  return next.replace(/\s+/g, " ").trim();
}

export function collectTranscripts(input: {
  transcript?: unknown;
  transcripts?: unknown;
}): string[] {
  const raw: string[] = [];
  if (Array.isArray(input.transcripts)) {
    for (const item of input.transcripts) {
      if (typeof item === "string") raw.push(item);
    }
  }
  if (typeof input.transcript === "string") raw.push(input.transcript);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
