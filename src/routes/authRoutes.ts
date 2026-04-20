// src/routes/authRoutes.ts
import { FastifyInstance } from "fastify";
import { register, login, getMe } from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register", register);
  fastify.post("/login", login);
  fastify.get("/me", { preHandler: authenticate }, getMe);
}
