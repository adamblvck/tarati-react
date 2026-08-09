import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_DEV ??
  process.env.DATABASE_URL_PRD ??
  "postgresql://postgres:postgres@localhost:5432/tarati_dev";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
