import { readFileSync, readdirSync, statSync } from "node:fs";
import { sep, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const learnRoot = join(repoRoot, "apps/learn");

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

describe("package boundary", () => {
  it("keeps the root site build and deploy workflow unchanged", () => {
    const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      workspaces?: unknown;
      scripts: { build: string };
    };
    expect(rootPackage.workspaces).toBeUndefined();
    expect(rootPackage.scripts.build).toBe("astro check && astro build && node scripts/check-build.mjs");
    expect(JSON.stringify(rootPackage)).not.toContain("apps/learn");

    const workflow = readFileSync(join(repoRoot, ".github/workflows/hostinger-deploy.yml"), "utf8");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("publish_dir: ./dist");
    expect(workflow).toContain("publish_branch: deploy");
    expect(workflow).not.toContain("apps/learn");
  });

  it("does not hard-code a live learning host or hidden client storage in the app code", () => {
    const scanned = walk(learnRoot).filter((path) => /\.(ts|tsx|css|mjs|html|json|example)$/.test(path));
    const code = scanned
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx") && !path.endsWith("package-lock.json"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replaceAll("supabase/seed.sql", "")
      .replaceAll("gemini-3.8-flash-tts", "")
      .replaceAll("GEMINI_API_KEY", "");

    const clientCode = scanned
      .filter((path) => path.includes(`${sep}src${sep}`) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(clientCode).not.toMatch(/GEMINI_API_KEY|generativelanguage|gemini/i);

    const appTsconfig = readFileSync(join(learnRoot, "tsconfig.json"), "utf8");
    const viteConfig = readFileSync(join(learnRoot, "vite.config.ts"), "utf8");
    const vitestConfig = readFileSync(join(learnRoot, "vitest.config.ts"), "utf8");
    const bundleScript = readFileSync(join(learnRoot, "scripts", "bundle-server.mjs"), "utf8");
    expect(appTsconfig).not.toContain("astro/tsconfigs");
    expect(viteConfig).toContain('tsconfig: "./tsconfig.json"');
    expect(vitestConfig).toContain('tsconfig: "./tsconfig.json"');
    expect(bundleScript).toContain('tsconfig: "tsconfig.json"');

    expect(code).not.toMatch(/learn\.haeonkorean\.com/i);
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|service_role/i);
    // 계정 DB(Supabase)는 같은 origin 서버만 부른다. 화면 코드는 DB 주소·키를 모른다.
    expect(clientCode).not.toMatch(/supabase|LEARN_DB_|LEARN_SESSION_SECRET|sb_secret_|sb_publishable_/i);
    expect(code).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}|sb_publishable_[A-Za-z0-9_-]{8,}/);
    expect(code).not.toMatch(/gemini/i);
    expect(code).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(relative(repoRoot, join(learnRoot, "package.json")).split(sep).join("/")).toBe("apps/learn/package.json");
  });
});
