import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/authMiddleware";
import {
  getRecipes,
  upsertRecipe,
  deleteRecipe,
} from "../controllers/recipeController";

export default async function recipeRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/", getRecipes);
  fastify.post("/", upsertRecipe);
  fastify.delete("/:id", deleteRecipe);
}
