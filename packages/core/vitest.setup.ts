import { config } from "dotenv";
import { resolve } from "node:path";

// Load the repo-root .env for local runs (CI passes DATABASE_URL[_APP] as env directly).
config({ path: resolve(process.cwd(), "../../.env") });

/*
 * Never let a test talk to a real wallet vendor.
 *
 * The root .env carries WALLET_PROVIDER=google once a developer has wired their issuer, and the
 * enrol path issues a pass — so without this the suite creates real pass objects in a live Google
 * account, slows to a crawl on network calls, and fails anywhere without connectivity. Domain tests
 * care THAT a pass was issued, not who issued it; the provider itself is covered in
 * @qrew/wallet-core against its own fixtures.
 */
process.env.WALLET_PROVIDER = "fake";
