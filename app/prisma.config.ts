import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prisma does not load Next.js env files automatically. Load `.env` first,
// then let `.env.local` override it for local development.
loadEnv({ path: path.join(__dirname, ".env") });
loadEnv({ path: path.join(__dirname, ".env.local"), override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Define it in app/.env.local or app/.env before running Prisma.",
  );
}
const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: path.join(__dirname, "src/prisma/schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  datasource: {
    url: databaseUrl,
  },
});
