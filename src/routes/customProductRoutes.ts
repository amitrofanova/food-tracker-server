import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import {
  getCustomProducts,
  upsertCustomProduct,
  deleteCustomProduct,
} from "../controllers/customProductController";

export default async function customProductRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/", getCustomProducts);
  fastify.post("/", upsertCustomProduct);
  fastify.delete("/:id", deleteCustomProduct);
}
