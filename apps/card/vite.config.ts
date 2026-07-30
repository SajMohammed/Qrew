import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Dev proxy: the card calls /api/* and Vite forwards to the NestJS API (no CORS).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../..", // read VITE_* (Google client id) from the repo-root .env, shared with the API
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true, // bind 0.0.0.0 so a phone on the same network can reach it
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
