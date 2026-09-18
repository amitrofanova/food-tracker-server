import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      JWT_SECRET: "vitest-jwt-secret",
      DATABASE_URL: "postgresql://vitest:vitest@127.0.0.1:5432/vitest",
    },
  },
});
