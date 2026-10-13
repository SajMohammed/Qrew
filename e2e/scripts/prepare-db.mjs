// Create (when missing) and migrate the database the end-to-end suite runs against, so it never
// touches development data. CI points E2E_DATABASE_URL at its own throwaway database instead.
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/qrew_e2e";

const maintenance = new URL(url);
const name = maintenance.pathname.slice(1);
maintenance.pathname = "/postgres";
const sql = postgres(maintenance.toString(), { max: 1, onnotice: () => {} });
try {
  const [found] = await sql`select 1 from pg_database where datname = ${name}`;
  if (!found) {
    // The name is ours (from config), not user input, and identifiers can't be bound as parameters.
    await sql.unsafe(`create database "${name.replace(/"/g, '""')}"`);
    console.log(`created database ${name}`);
  }
} finally {
  await sql.end();
}

execFileSync("pnpm", ["--filter", "@qrew/db", "migrate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, NODE_ENV: process.env.NODE_ENV ?? "test" },
});
