import { config } from "dotenv";
import { resolve } from "node:path";

// Load the repo-root .env for local runs (CI passes DATABASE_URL[_APP] as env directly).
config({ path: resolve(process.cwd(), "../../.env") });
