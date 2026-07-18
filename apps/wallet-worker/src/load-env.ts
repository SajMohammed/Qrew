import { config } from "dotenv";
import { resolve } from "node:path";

// Side-effect module, imported FIRST in main.ts so env is populated before @qrew/db
// (which reads DATABASE_URL at import time) loads. In production, env comes from the
// platform and these files simply don't exist — config() no-ops.
config({ path: resolve(process.cwd(), "../../.env") }); // when run from apps/wallet-worker
config(); // when run from the repo root
