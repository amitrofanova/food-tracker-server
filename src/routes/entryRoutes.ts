// src/routes/entryRoutes.ts
import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import {
  createEntry,
  getEntriesByDate,
  updateEntry,
  deleteEntry,
} from "../controllers/entryController";

export default async function entryRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.post("/", createEntry);
  fastify.get("/", getEntriesByDate);
  fastify.patch("/:id", updateEntry);
  fastify.delete("/:id", deleteEntry);
}
