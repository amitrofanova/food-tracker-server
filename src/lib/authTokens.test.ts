import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
  prisma: {
    refreshToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown) => ops),
  },
}));

import { rotateRefreshToken } from "./authTokens";
import { prisma } from "./prisma";

describe("rotateRefreshToken reuse detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("burns the user's refresh family when a revoked token is presented again", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "old-row",
      tokenHash: "hash",
      userId: 42,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
    });
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 });

    const result = await rotateRefreshToken("revoked-refresh-token");

    expect(result).toBeNull();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not burn the family for an expired but never-rotated token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "expired-row",
      tokenHash: "hash",
      userId: 42,
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const result = await rotateRefreshToken("expired-refresh-token");

    expect(result).toBeNull();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rotates a valid refresh token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "active-row",
      tokenHash: "hash",
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);

    const result = await rotateRefreshToken("active-refresh-token");

    expect(result).toEqual({
      userId: 7,
      refreshToken: expect.any(String),
    });
    expect(result?.refreshToken.length).toBeGreaterThan(10);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
