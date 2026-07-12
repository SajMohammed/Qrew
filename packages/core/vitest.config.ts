import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Resolve workspace deps to their TypeScript source so core's tests run without a build step.
// (Production still consumes the compiled dist via each package's "main".)
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 20000,
    testTimeout: 20000,
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@qrew/db": resolve(__dirname, "../db/src/index.ts"),
      "@qrew/wallet-core": resolve(__dirname, "../wallet-core/src/index.ts"),
    },
  },
});
