export type VoiceMeal = "breakfast" | "lunch" | "dinner" | "snack";

export type VoiceIntentKind = "add_entry" | "unknown" | "needs_clarification";

export type MatchedProduct = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type VoiceParseResponse = {
  intent: VoiceIntentKind;
  productName: string | null;
  searchQuery: string | null;
  weight: number | null;
  meal: VoiceMeal;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  matchedProduct: MatchedProduct | null;
};

export type VoiceSlots = {
  meal: VoiceMeal | null;
  weight: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

export type VoiceLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};
