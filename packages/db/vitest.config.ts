import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    hookTimeout: 20000,
    testTimeout: 20000,
    // The RLS suite shares one database — keep it serial.
    pool: "forks",
    fileParallelism: false,
  },
});
