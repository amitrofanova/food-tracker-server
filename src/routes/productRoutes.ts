import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import { upsertProduct } from "../controllers/productController";
import {
  searchProducts,
  getProductByBarcode,
} from "../controllers/productSearchController";

export default async function productRoutes(fastify: FastifyInstance) {
  fastify.get("/search", searchProducts);
  fastify.get("/barcode/:barcode", getProductByBarcode);
  fastify.post("/", { preHandler: authenticate }, upsertProduct);
}
