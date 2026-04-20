// src/controllers/authController.ts
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;
const JWT_SECRET =
  process.env.JWT_SECRET || "your_strong_jwt_secret_should_be_in_env";

export const register = async (request: any, reply: any) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.status(400).send({ error: "Email and password are required" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
      },
      select: { id: true, email: true, createdAt: true },
    });

    return reply.status(201).send(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply
          .status(409)
          .send({ error: "User with this email already exists" });
      }
    }
    console.error("Registration error:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
};

export const login = async (request: any, reply: any) => {
  const { email, password } = request.body;

  if (!email || !password) {
    return reply.status(400).send({ error: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return reply.send({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Login error:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
};

export const getMe = async (request: any, reply: any) => {
  const userId = request.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }
    return reply.send(user);
  } catch (error) {
    console.error("Get me error:", error);
    return reply.status(500).send({ error: "Internal server error" });
  }
};
