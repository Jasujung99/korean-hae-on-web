import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const designSystem = fileURLToPath(new URL("../../src/design-system", import.meta.url));

export default defineConfig({
  tsconfig: "./tsconfig.json",
  plugins: [react()],
  resolve: {
    alias: {
      "@design": designSystem,
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx", "content/**/*.test.ts"],
  },
});
