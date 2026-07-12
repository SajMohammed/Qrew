import { config } from "dotenv";
import { resolve } from "node:path";

// Load the repo-root .env for local runs. In CI, DATABASE_URL[_APP] are passed as env
// directly, so this simply no-ops if the file is absent.
config({ path: resolve(process.cwd(), "../../.env") });
