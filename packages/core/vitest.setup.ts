import { config } from "dotenv";
import { resolve } from "node:path";
import { TEST_REDIS_URL } from "./vitest.global-setup";

// Load the repo-root .env for local runs (CI passes DATABASE_URL[_APP] as env directly).
config({ path: resolve(process.cwd(), "../../.env") });

/*
 * Never let a test talk to a real wallet vendor.
 *
 * The root .env carries WALLET_PROVIDER=google once a developer has wired their issuer, and card
 * reads and design saves call the provider — so without this the suite talks to a live Google
 * account, slows to a crawl on network calls, and fails anywhere without connectivity. The provider
 * itself is covered in @qrew/wallet-core against its own fixtures.
 */
process.env.WALLET_PROVIDER = "fake";

/*
 * …and never let a test's wallet jobs reach a real worker.
 *
 * Enrolling, stamping and saving a design all queue wallet jobs. On the root .env's Redis those land
 * in the queue a developer's always-on wallet worker is draining — with the real Google provider —
 * which would create live passes and classes for test programmes. Redis database 15 has no worker;
 * vitest.global-setup.ts clears what earlier runs left there.
 */
process.env.REDIS_URL = TEST_REDIS_URL;
