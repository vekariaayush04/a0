import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

const port = process.env.SENTINEL_PORT ?? "4747";

export default defineConfig({
  plugins: [react()],
  // Surfaced as the tiny version string in the sidebar brand row.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${port}`,
        changeOrigin: false,
      },
    },
  },
});
