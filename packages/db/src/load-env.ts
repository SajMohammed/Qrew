import { config } from "dotenv";
import { resolve } from "node:path";

// Side-effect module. Import it FIRST (before ./index) so DATABASE_URL is populated
// before client.ts reads it. db scripts run from packages/db, so ../../.env is the root.
config({ path: resolve(process.cwd(), "../../.env") });
