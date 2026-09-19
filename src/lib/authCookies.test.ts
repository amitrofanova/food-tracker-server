import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { isNativeClient } from "./authCookies";

function request(partial: {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}): FastifyRequest {
  return {
    headers: partial.headers ?? {},
    body: partial.body,
  } as FastifyRequest;
}

describe("isNativeClient", () => {
  it("detects the X-Client: capacitor header", () => {
    expect(
      isNativeClient(request({ headers: { "x-client": "capacitor" } })),
    ).toBe(true);
  });

  it("detects a Capacitor login body flag", () => {
    expect(
      isNativeClient(request({ body: { client: "capacitor", email: "a@b.c" } })),
    ).toBe(true);
  });

  it("detects a native refresh body with refreshToken", () => {
    expect(
      isNativeClient(request({ body: { refreshToken: "secret-refresh" } })),
    ).toBe(true);
  });

  it("treats a browser login/refresh body as web", () => {
    expect(isNativeClient(request({ body: { email: "a@b.c" } }))).toBe(false);
    expect(isNativeClient(request({ body: {} }))).toBe(false);
  });
});
