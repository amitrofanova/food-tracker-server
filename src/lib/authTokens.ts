import "dotenv/config";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./authCookies";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

const jwtSecret = getJwtSecret();

export type AccessTokenPayload = {
  userId: number;
  typ: "access";
};

export function signAccessToken(userId: number): string {
  return jwt.sign({ userId, typ: "access" } satisfies AccessTokenPayload, jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, jwtSecret);
  if (
    typeof decoded === "string" ||
    decoded.typ !== "access" ||
    typeof decoded.userId !== "number"
  ) {
    throw new Error("Invalid access token");
  }
  return { userId: decoded.userId, typ: "access" };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: number): Promise<{
  token: string;
  refreshToken: string;
}> {
  const token = signAccessToken(userId);
  const refreshToken = generateRefreshTokenValue();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return { token, refreshToken };
}

export async function rotateRefreshToken(
  currentToken: string,
): Promise<{ userId: number; refreshToken: string } | null> {
  const tokenHash = hashRefreshToken(currentToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
    return null;
  }

  const nextRefreshToken = generateRefreshTokenValue();
  const nextHash = hashRefreshToken(nextRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: nextHash,
        userId: existing.userId,
        expiresAt,
      },
    }),
  ]);

  return { userId: existing.userId, refreshToken: nextRefreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
