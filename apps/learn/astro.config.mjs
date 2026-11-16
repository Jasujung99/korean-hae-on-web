// 해온 성인 소리 학습 앱 (apps/learn) 설정.
// 결정 근거는 docs/adr/0001-app-framework-and-runtime.md 를 본다.
import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
// 해온 본사이트의 현재 디자인 시스템(단일 원본). 복사하지 않고 직접 읽는다.
const designSystemDir = fileURLToPath(new URL("../../src/design-system/", import.meta.url));

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  trailingSlash: "ignore",
  // 폼 POST의 기본 Origin 검사. JSON API는 src/middleware.ts 에서 따로 검사한다.
  security: { checkOrigin: true },
  server: { host: "0.0.0.0", port: 4400 },
  devToolbar: { enabled: false },
  vite: {
    // 루트 tsconfig.json(astro/tsconfigs/strict 상속, 루트 node_modules 필요)을 자동 탐색하지 않고
    // 이 앱의 tsconfig 하나로 고정한다. 루트 node_modules 없이도 빌드되게 하는 설정.
    tsconfig: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
    server: {
      fs: { allow: [appRoot, designSystemDir] },
    },
  },
});
