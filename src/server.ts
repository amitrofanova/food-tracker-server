import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import authRoutes from "./routes/authRoutes";
import entryRoutes from "./routes/entryRoutes";
import productRoutes from "./routes/productRoutes";
import customProductRoutes from "./routes/customProductRoutes";
import recipeRoutes from "./routes/recipeRoutes";
import voiceRoutes from "./routes/voiceRoutes";

const isProduction = process.env.NODE_ENV === "production";

const start = async () => {
  const fastify = Fastify({
    logger: isProduction ? { level: "error" } : true,
    bodyLimit: 1_048_576, // 1 MB
    trustProxy: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      },
    },
  });

  await fastify.register(cookie);

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  const productionOrigins = [
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
  ];
  if (process.env.APP_ORIGIN) {
    productionOrigins.push(process.env.APP_ORIGIN);
  }

  await fastify.register(cors, {
    origin: isProduction
      ? productionOrigins
      : ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Client"],
  });

  fastify.register(authRoutes, { prefix: "/api/auth" });
  fastify.register(entryRoutes, { prefix: "/api/entries" });
  fastify.register(productRoutes, { prefix: "/api/products" });
  fastify.register(customProductRoutes, { prefix: "/api/custom-products" });
  fastify.register(recipeRoutes, { prefix: "/api/recipes" });
  fastify.register(voiceRoutes, { prefix: "/api/voice" });

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
  } else {
    // IDEs probe the forwarded port with GET / and Chrome DevTools /json/*.
    fastify.get("/", async () => {
      return { status: "OK" };
    });

    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/json/")) {
        return reply.code(404).send();
      }

      req.log.info(`Route ${req.method}:${req.url} not found`);
      return reply.code(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: "Not Found",
        statusCode: 404,
      });
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
