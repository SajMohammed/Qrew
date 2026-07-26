import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../..", // read VITE_* (Clerk key) from the repo-root .env, shared with the API
  server: {
    host: true, // bind 0.0.0.0 so a phone on the same network can reach it
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
