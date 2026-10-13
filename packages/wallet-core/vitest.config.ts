import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Strip rendering is CPU-bound pure-JS PNG work: the layout sweep takes ~4s on a laptop, so the
    // 5s default fails on a shared CI runner. Matches the db and core packages.
    testTimeout: 20000,
  },
});
