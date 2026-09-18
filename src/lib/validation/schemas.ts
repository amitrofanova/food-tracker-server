import { z } from "zod";

export const nutritionValueSchema = z
  .number({ error: "must be a non-negative number" })
  .nonnegative({ error: "must be a non-negative number" });

const entityIdSchema = z
  .string({ error: "id is required" })
  .trim()
  .min(1, { error: "id is required" })
  .max(200, { error: "id is too long" });

const productNameSchema = z
  .string({ error: "name is required" })
  .trim()
  .min(1, { error: "name is required" })
  .max(200, { error: "name is too long" });

export const weightSchema = z
  .number({ error: "Weight must be a positive number up to 10000" })
  .gt(0, { error: "Weight must be a positive number up to 10000" })
  .lte(10000, { error: "Weight must be a positive number up to 10000" });

export const mealTypeSchema = z
  .string({ error: "Invalid meal type" })
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z.enum(["breakfast", "lunch", "dinner", "snack"], {
      error: "Invalid meal type",
    }),
  )
  .transform((value) => value.toUpperCase() as "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK");

export const customProductSchema = z.object({
  id: entityIdSchema,
  name: productNameSchema,
  calories: nutritionValueSchema,
  protein: nutritionValueSchema,
  fat: nutritionValueSchema,
  carbs: nutritionValueSchema,
});

export const recipeIngredientSchema = z.object({
  productId: z.string().trim().min(1, { error: "productId is required" }),
  productName: z.string().trim().min(1, { error: "productName is required" }),
  weight: nutritionValueSchema,
  calories: nutritionValueSchema,
  protein: nutritionValueSchema,
  fat: nutritionValueSchema,
  carbs: nutritionValueSchema,
});

export const recipeSchema = z.object({
  id: entityIdSchema,
  name: productNameSchema,
  totalWeight: nutritionValueSchema,
  calories: nutritionValueSchema,
  protein: nutritionValueSchema,
  fat: nutritionValueSchema,
  carbs: nutritionValueSchema,
  ingredients: z.array(recipeIngredientSchema),
});

export const productSchema = z.object({
  name: productNameSchema,
  calories: nutritionValueSchema,
  protein: nutritionValueSchema,
  fat: nutritionValueSchema,
  carbs: nutritionValueSchema,
});

const optionalNonEmptyString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createEntrySchema = z
  .object({
    date: z
      .string({ error: "date is required" })
      .trim()
      .min(1, { error: "date is required" })
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        error: "Invalid date",
      }),
    productId: optionalNonEmptyString,
    productName: optionalNonEmptyString,
    mealType: mealTypeSchema,
    weight: weightSchema,
    calories: nutritionValueSchema.optional(),
    protein: nutritionValueSchema.optional(),
    fat: nutritionValueSchema.optional(),
    carbs: nutritionValueSchema.optional(),
  })
  .refine((data) => Boolean(data.productId || data.productName), {
    error: "Either productId or productName is required",
  });

export const updateEntrySchema = z.object({
  weight: weightSchema.optional(),
  mealType: mealTypeSchema.optional(),
});

export const updateMeSchema = z.object({
  calorieBudget: z.union([
    z
      .number({ error: "calorieBudget must be an integer or null" })
      .int({ error: "calorieBudget must be an integer or null" })
      .min(0, { error: "calorieBudget must be between 0 and 20000" })
      .max(20000, { error: "calorieBudget must be between 0 and 20000" }),
    z.null({ error: "calorieBudget must be an integer or null" }),
  ]),
});

export type CustomProductInput = z.infer<typeof customProductSchema>;
export type RecipeInput = z.infer<typeof recipeSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
