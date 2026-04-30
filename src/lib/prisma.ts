// src/lib/prisma.ts
import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Переменная окружения DATABASE_URL не задана");
}

const pool = new Pool({ connectionString: databaseUrl });

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
