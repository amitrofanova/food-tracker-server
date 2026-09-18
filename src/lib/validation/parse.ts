import { z } from "zod";

export function parseWithSchema<S extends z.ZodType>(
  schema: S,
  body: unknown,
  fallbackError = "Некорректные данные",
): { data: z.infer<S> } | { error: string } {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    if (!firstIssue) {
      return { error: fallbackError };
    }
    const path = firstIssue.path.join(".");
    const message = firstIssue.message || fallbackError;
    return { error: path ? `${path}: ${message}` : message };
  }
  return { data: result.data };
}
