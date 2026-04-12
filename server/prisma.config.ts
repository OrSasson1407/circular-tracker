// 📋 server/prisma.config.ts
// This file replaces the 'url' property in your schema.prisma

import "dotenv/config";
import { defineConfig } from "@prisma/config";

export default defineConfig({
  // Tells Prisma where your schema lives
  schema: "prisma/schema.prisma",
  
  // Tells Prisma where to store your migration history
  migrations: {
    path: "prisma/migrations",
  },
  
  // The engine connection logic
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});