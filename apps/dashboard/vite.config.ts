import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../..", // read VITE_* (Clerk key) from the repo-root .env, shared with the API
  resolve: {
    // shadcn/ui components are copied in and import each other through "@/..."
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5175,
    proxy: {
      // `vite preview` inherits this proxy; the e2e suite points it at its own API.
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
