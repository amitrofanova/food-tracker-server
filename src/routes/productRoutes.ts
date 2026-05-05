import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import { upsertProduct } from "../controllers/productController";

export default async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.post("/", upsertProduct);
}
