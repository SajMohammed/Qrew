import { defineConfig } from "drizzle-kit";

// drizzle-kit powers `studio` and typed schema diffing. Our RLS policies + roles
// live in hand-written SQL (migrations/*.sql, applied by src/migrate.ts), because
// drizzle-kit does not manage row-level-security policies or DB roles.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/qrew",
  },
});
