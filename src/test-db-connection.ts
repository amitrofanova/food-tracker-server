// src/test-db-connection.ts
import dotenv from "dotenv";
import { prisma } from "./lib/prisma";

// Загружаем переменные окружения (на случай, если запускаете вне Fastify)
dotenv.config();

console.log("🔍 DATABASE_URL из .env:", process.env.DATABASE_URL);
console.log("Тип:", typeof process.env.DATABASE_URL);
async function testConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Успешное подключение к PostgreSQL!");

    // Пример: создадим временного пользователя
    const user = await prisma.user.create({
      data: { email: "test@example.com" },
      select: { id: true, email: true },
    });
    console.log("🆕 Создан пользователь:", user);

    // Удалим его сразу
    await prisma.user.delete({ where: { id: user.id } });

    await prisma.$disconnect();
    console.log("🔌 Отключились от БД");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

testConnection();
