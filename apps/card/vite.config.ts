import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the card calls /api/* and Vite forwards to the NestJS API (no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
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
