import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import authRoutes from "./routes/authRoutes";
import entryRoutes from "./routes/entryRoutes";
import productRoutes from "./routes/productRoutes";
import customProductRoutes from "./routes/customProductRoutes";
import recipeRoutes from "./routes/recipeRoutes";

const isProduction = process.env.NODE_ENV === "production";

const start = async () => {
  const fastify = Fastify({
    logger: isProduction ? { level: "error" } : true,
    bodyLimit: 1_048_576, // 1 MB
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": ["'self'", "https://world.openfoodfacts.org"],
      },
    },
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await fastify.register(cors, {
    origin: isProduction
      ? ['capacitor://localhost', 'https://localhost', 'http://localhost']
      : ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  fastify.register(authRoutes, {
    prefix: "/api/auth",
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  });
  fastify.register(entryRoutes, { prefix: "/api/entries" });
  fastify.register(productRoutes, { prefix: "/api/products" });
  fastify.register(customProductRoutes, { prefix: "/api/custom-products" });
  fastify.register(recipeRoutes, { prefix: "/api/recipes" });

  fastify.get("/health", async () => {
    return { status: "OK" };
  });

  if (isProduction) {
    const clientRoot = path.join(__dirname, "..", "public");

    await fastify.register(staticFiles, {
      root: clientRoot,
      prefix: "/",
    });

    fastify.setNotFoundHandler((_req, reply) => {
      reply.sendFile("index.html");
    });
  }

  const port = parseInt(process.env.PORT || "3001", 10);

  try {
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Fastify server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
