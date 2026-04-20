// src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import authRoutes from "./routes/authRoutes";
import entryRoutes from "./routes/entryRoutes";
import { prisma } from "./lib/prisma";

const start = async () => {
  const fastify = Fastify({
    logger: true,
  });

  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? ["https://my-frontend.onrender.com"]
      : ["http://localhost:5173"];

  await fastify.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(entryRoutes, { prefix: "/entries" });

  fastify.get("/health", async () => {
    return { status: "OK", timestamp: new Date().toISOString() };
  });

  const port = parseInt(process.env.PORT || "3001", 10);

  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log("🚀 Fastify server running on http://localhost:3001");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
