import type { FastifyReply } from "fastify";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

const isProduction = process.env.NODE_ENV === "production";

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  const base = baseCookieOptions();
  reply.setCookie(ACCESS_COOKIE, accessToken, {
    ...base,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  const base = baseCookieOptions();
  reply.clearCookie(ACCESS_COOKIE, base);
  reply.clearCookie(REFRESH_COOKIE, base);
}
