import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { learnApiPlugin } from "./server/vite-plugin.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designSystem = fileURLToPath(new URL("../../src/design-system", import.meta.url));

export default defineConfig({
  tsconfig: "./tsconfig.json",
  plugins: [react(), learnApiPlugin()],
  resolve: {
    alias: {
      "@design": designSystem,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    cors: false,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    cors: false,
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
