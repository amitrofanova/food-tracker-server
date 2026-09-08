import { z } from "zod";

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введите email и пароль")
    .email("Введите корректный email")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .max(72, "Пароль слишком длинный"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export function parseCredentials(
  body: unknown,
): { data: Credentials } | { error: string } {
  const result = credentialsSchema.safeParse(body ?? {});
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { error: firstIssue?.message ?? "Введите email и пароль" };
  }
  return { data: result.data };
}
