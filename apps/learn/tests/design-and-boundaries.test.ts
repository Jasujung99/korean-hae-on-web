import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { logoPaths } from "../src/lib/logo";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(appRoot, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const srcFiles = walk(join(appRoot, "src"));

describe("해온 디자인 토큰 어댑터", () => {
  const rootTokens = read(join(repoRoot, "src/design-system/tokens.css"));
  const defined = new Set([...rootTokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const adapter = read(join(appRoot, "src/styles/haeon-adapter.css"));

  it("어댑터가 참조하는 원본 변수는 모두 루트 tokens.css 에 있다", () => {
    const own = new Set([...adapter.matchAll(/(--learn-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const refs = [...adapter.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) expect(defined.has(r) || own.has(r), r).toBe(true);
  });

  it("종이색·올리브·명조·세이지·라벤더를 원본에서 이어받는다", () => {
    for (const key of ["--paper", "--olive", "--font-serif", "--wash-sage", "--wash-lavender", "--sage", "--lavender"]) {
      expect(adapter).toContain(`var(${key})`);
    }
    expect(rootTokens).toMatch(/--font-serif:\s*"Noto Serif KR"/);
  });

  it("레이아웃이 원본 tokens.css·base.css 를 직접 불러온다", () => {
    const layout = read(join(appRoot, "src/layouts/LearnLayout.astro"));
    expect(layout).toContain('import "../../../../src/design-system/tokens.css"');
    expect(layout).toContain('import "../../../../src/design-system/base.css"');
  });

  it("학습 앱 스타일에 별도 색 값을 하드코딩하지 않는다", () => {
    const offenders: string[] = [];
    for (const f of srcFiles.filter((p) => /\.(css|astro)$/.test(p))) {
      read(f).split("\n").forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !line.includes('name="theme-color"')) offenders.push(`${relative(appRoot, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("실제 해온 로고 SVG 경로를 쓴다", () => {
    const svg = read(join(repoRoot, "src/design-system/logos/logo-olive.svg"));
    for (const d of Object.values(logoPaths)) {
      expect(d.length).toBeGreaterThan(100);
      expect(svg).toContain(d);
    }
  });
});

describe("경계", () => {
  it("옛 디자인·옛 사이트·루트 index.html 을 참조하지 않는다", () => {
    for (const f of srcFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/old-site|old-design-system|\.\.\/index\.html/);
    }
  });

  it("개발 1단계 앱 코드는 비밀값·외부 서비스·localStorage 를 쓰지 않는다", () => {
    for (const f of srcFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/GEMINI_API_KEY|SUPABASE|supabase\.co|generativelanguage|localStorage|sessionStorage/);
    }
  });

  it("제안 운영 주소를 실제 링크나 기본값으로 쓰지 않는다", () => {
    for (const f of srcFiles) {
      expect(read(f), f).not.toMatch(/https?:\/\/learn\.haeonkorean\.com/);
    }
  });

  it("Vite 가 루트 tsconfig.json 을 자동 탐색하지 않도록 앱 tsconfig 로 고정한다", () => {
    // 루트 tsconfig 는 astro/tsconfigs/strict 를 상속해 루트 node_modules 가 있어야만 풀린다.
    const config = read(join(appRoot, "astro.config.mjs"));
    expect(config).toMatch(/tsconfig:\s*fileURLToPath\(new URL\("\.\/tsconfig\.json", import\.meta\.url\)\)/);
  });

  it("루트 package.json 은 학습 앱을 workspace·스크립트로 끌어들이지 않는다", () => {
    const pkg = JSON.parse(read(join(repoRoot, "package.json")));
    expect(pkg.workspaces).toBeUndefined();
    expect(JSON.stringify(pkg.scripts)).not.toContain("apps/learn");
  });
});
