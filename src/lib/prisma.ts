// src/lib/prisma.ts
import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Переменная окружения DATABASE_URL не задана");
}

const parsed = new URL(databaseUrl);
const user = parsed.username;
const password = parsed.password;
const host = parsed.hostname;
const port = parseInt(parsed.port || "5432", 10);
const database = parsed.pathname.substring(1);

const pool = new Pool({
  host,
  port,
  user,
  password,
  database,
});

export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
