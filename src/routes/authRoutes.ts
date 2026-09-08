import { FastifyInstance } from "fastify";
import {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
} from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "15 minutes",
    },
  },
};

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register", authRateLimit, register);
  fastify.post("/login", authRateLimit, login);
  fastify.post("/refresh", authRateLimit, refresh);
  fastify.post("/logout", logout);
  fastify.get("/me", { preHandler: authenticate }, getMe);
  fastify.patch("/me", { preHandler: authenticate }, updateMe);
}
