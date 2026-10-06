import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

// Load the repo-root .env for local runs (CI passes DATABASE_URL as env directly).
config({ path: resolve(process.cwd(), "../../.env") });

// Minimal, dependency-light migration runner. Applies migrations/*.sql in order,
// each wrapped in a single transaction, tracked in `_qrew_migrations`. Runs as the DB
// owner (DATABASE_URL), so it can create roles and RLS policies drizzle-kit can't.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// 0000 creates the app role with a development password that is public in this repo. Anywhere
// but a developer's machine or a test run, the real one must be supplied, and is (re)applied on
// every run so the role never keeps the default. Restricted to a charset that needs no quoting,
// because ALTER ROLE takes the password as a literal, not a bind parameter.
const appPassword = process.env.QREW_APP_PASSWORD;
const devLike = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (appPassword !== undefined && !/^[A-Za-z0-9_\-+=/.]{24,128}$/.test(appPassword)) {
  console.error("QREW_APP_PASSWORD must be 24-128 characters of A-Z a-z 0-9 _ - + = / .");
  process.exit(1);
}
if (!appPassword && !devLike) {
  console.error("QREW_APP_PASSWORD is required outside development and test (the default is public).");
  process.exit(1);
}

const dir = join(__dirname, "..", "migrations");

async function main(): Promise<void> {
  const client = postgres(url as string, { max: 1 });
  try {
    await client`create table if not exists _qrew_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
    const applied = new Set(
      (await client`select name from _qrew_migrations`).map((r) => r.name as string),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`· skip ${file}`);
        continue;
      }
      const ddl = readFileSync(join(dir, file), "utf8");
      console.log(`→ apply ${file}`);
      // One simple-protocol call = one implicit transaction; atomic all-or-nothing.
      // The file name is our own (not user input), so interpolation here is safe.
      const wrapped = `begin;\n${ddl}\n;\ninsert into _qrew_migrations (name) values ('${file}');\ncommit;`;
      await client.unsafe(wrapped);
    }
    console.log("✓ migrations up to date");
    if (appPassword) {
      await client.unsafe(`alter role qrew_app with password '${appPassword}'`);
      console.log("✓ qrew_app password set from QREW_APP_PASSWORD");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
