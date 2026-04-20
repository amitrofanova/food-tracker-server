// src/middleware/authMiddleware.ts
import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "your_strong_jwt_secret_should_be_in_env";

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply
      .status(401)
      .send({ error: "Authorization header missing or invalid" });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    // Прикрепляем userId к запросу
    request.user = { id: decoded.userId };
  } catch (err) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
};

// Расширяем тип FastifyRequest
declare module "fastify" {
  interface FastifyRequest {
    user?: { id: number };
  }
}
