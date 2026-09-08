import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseCredentials } from "../lib/authValidation";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../lib/authCookies";
import {
  createSession,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../lib/authTokens";

const SALT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH =
  "$2b$12$pev8Qw.4vh7hBIPTvGiUf.zQpSH0KN4./xW0QvMidfWO.3bDNfNd6";

type PublicUser = {
  id: number;
  email: string;
  calorieBudget: number | null;
};

function toPublicUser(user: PublicUser) {
  return {
    id: user.id,
    email: user.email,
    calorieBudget: user.calorieBudget,
  };
}

function readRefreshToken(request: FastifyRequest): string | undefined {
  const fromCookie = request.cookies[REFRESH_COOKIE];
  if (fromCookie) return fromCookie;
  const body = request.body as { refreshToken?: unknown } | null;
  if (
    body &&
    typeof body.refreshToken === "string" &&
    body.refreshToken.length > 0
  ) {
    return body.refreshToken;
  }
  return undefined;
}

async function issueAuthResponse(
  reply: FastifyReply,
  user: PublicUser,
  statusCode = 200,
) {
  const { token, refreshToken } = await createSession(user.id);
  setAuthCookies(reply, token, refreshToken);
  return reply.status(statusCode).send({
    token,
    refreshToken,
    user: toPublicUser(user),
  });
}

export const register = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = parseCredentials(request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }

  const { email, password } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        calorieBudget: 2000,
      },
      select: { id: true, email: true, createdAt: true },
    });

    return reply.status(201).send(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply
          .status(409)
          .send({ error: "Такой email уже используется" });
      }
    }
    console.error("Registration error:", error);
    return reply.status(500).send({ error: "Ошибка сервера" });
  }
};

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = parseCredentials(request.body);
  if ("error" in parsed) {
    return reply.status(400).send({ error: parsed.error });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return reply.status(401).send({ error: "Неверный email или пароль" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return reply.status(401).send({ error: "Неверный email или пароль" });
    }

    return issueAuthResponse(reply, user);
  } catch (error) {
    console.error("Login error:", error);
    return reply.status(500).send({ error: "Ошибка сервера" });
  }
};

export const refresh = async (request: FastifyRequest, reply: FastifyReply) => {
  const currentToken = readRefreshToken(request);
  if (!currentToken) {
    return reply.status(401).send({ error: "Refresh-токен отсутствует" });
  }

  try {
    const rotated = await rotateRefreshToken(currentToken);
    if (!rotated) {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: "Недействительный refresh-токен" });
    }

    const token = signAccessToken(rotated.userId);
    setAuthCookies(reply, token, rotated.refreshToken);
    return reply.send({
      token,
      refreshToken: rotated.refreshToken,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return reply.status(500).send({ error: "Ошибка сервера" });
  }
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
  const currentToken = readRefreshToken(request);
  try {
    if (currentToken) {
      await revokeRefreshToken(currentToken);
    }
    clearAuthCookies(reply);
    return reply.status(204).send();
  } catch (error) {
    console.error("Logout error:", error);
    return reply.status(500).send({ error: "Ошибка сервера" });
  }
};

export const getMe = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, calorieBudget: true },
    });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }
    return reply.send(user);
  } catch (error) {
    console.error("Get me error:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
};

export const updateMe = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user!.id;
  const { calorieBudget } = request.body as { calorieBudget?: number };
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { calorieBudget: calorieBudget ?? null },
      select: { id: true, email: true, calorieBudget: true },
    });
    return reply.send(user);
  } catch (error) {
    console.error("Update me error:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
};
