import { FastifyInstance } from "fastify";
import {
  register,
  login,
  getMe,
  updateMe,
} from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register", register);
  fastify.post("/login", login);
  fastify.get("/me", { preHandler: authenticate }, getMe);
  fastify.patch("/me", { preHandler: authenticate }, updateMe);
}
