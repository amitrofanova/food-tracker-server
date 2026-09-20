import { z } from "zod";
import type { VoiceIntentKind, VoiceMeal } from "./types";

const nullableInt = z.union([
  z.null(),
  z
    .number({ error: "must be a number" })
    .finite({ error: "must be a number" })
    .transform((value) => Math.max(0, Math.round(value))),
]);

const nullableName = z.union([
  z.null(),
  z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value.length === 0 ? null : value)),
]);

export const llmVoiceIntentSchema = z
  .object({
    intent: z.enum(["add_entry", "unknown", "needs_clarification"]),
    productName: nullableName,
    weightGrams: nullableInt,
    meal: z.union([
      z.null(),
      z.enum(["breakfast", "lunch", "dinner", "snack"]),
    ]),
    calories: nullableInt,
    protein: nullableInt,
    fat: nullableInt,
    carbs: nullableInt,
  })
  .superRefine((value, ctx) => {
    if (value.intent === "add_entry" && !value.productName) {
      ctx.addIssue({
        code: "custom",
        message: "add_entry requires productName",
        path: ["productName"],
      });
    }
  });

export type LlmVoiceIntent = z.infer<typeof llmVoiceIntentSchema>;

export const VOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["add_entry", "unknown", "needs_clarification"],
    },
    productName: { type: ["string", "null"] },
    weightGrams: { type: ["integer", "null"] },
    meal: {
      type: ["string", "null"],
      enum: ["breakfast", "lunch", "dinner", "snack", null],
    },
    calories: { type: ["integer", "null"] },
    protein: { type: ["integer", "null"] },
    fat: { type: ["integer", "null"] },
    carbs: { type: ["integer", "null"] },
  },
  required: [
    "intent",
    "productName",
    "weightGrams",
    "meal",
    "calories",
    "protein",
    "fat",
    "carbs",
  ],
} as const;

export function formatSchemaIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function isVoiceIntentKind(value: string): value is VoiceIntentKind {
  return (
    value === "add_entry" ||
    value === "unknown" ||
    value === "needs_clarification"
  );
}

export function isVoiceMeal(value: string): value is VoiceMeal {
  return (
    value === "breakfast" ||
    value === "lunch" ||
    value === "dinner" ||
    value === "snack"
  );
}
