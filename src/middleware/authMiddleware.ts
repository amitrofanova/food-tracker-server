import { FastifyRequest, FastifyReply } from "fastify";
import { ACCESS_COOKIE } from "../lib/authCookies";
import { verifyAccessToken } from "../lib/authTokens";

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;
  const bearerToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const cookieToken = request.cookies[ACCESS_COOKIE];
  const token = bearerToken || cookieToken;

  if (!token) {
    return reply
      .status(401)
      .send({ error: "Authorization header missing or invalid" });
  }

  try {
    const decoded = verifyAccessToken(token);
    request.user = { id: decoded.userId };
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
};

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: number };
  }
}
