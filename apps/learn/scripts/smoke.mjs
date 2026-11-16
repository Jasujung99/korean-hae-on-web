// 빌드된 서버(dist/server/entry.mjs)를 실제로 띄워 개발 1단계 경계를 확인한다.
// 키·DB·외부 네트워크 없이 동작한다. 먼저 `npm run build` 를 실행한다.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const entry = new URL("../dist/server/entry.mjs", import.meta.url);
if (!existsSync(entry)) {
  console.error("dist/server/entry.mjs 가 없습니다. 먼저 npm run build 를 실행하세요.");
  process.exit(1);
}

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function withServer(extraEnv, fn) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // 부모 환경의 비밀값을 넘기지 않도록 필요한 값만 전달한다.
  const env = { PATH: process.env.PATH, HOST: "127.0.0.1", PORT: String(port), LEARN_APP_ORIGIN: origin, ...extraEnv };
  const child = spawn(process.execPath, [entry.pathname], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  try {
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(origin + "/api/health");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    await fn(origin);
  } catch (e) {
    console.error(log);
    throw e;
  } finally {
    child.kill();
  }
}

const routes = ["/", "/join", "/practice", "/practice/compare", "/practice/finish", "/words", "/teacher", "/teacher/learners/abc"];
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};

await withServer({}, async (origin) => {
  for (const path of routes) {
    const res = await fetch(origin + path);
    const html = await res.text();
    ok(res.status === 200, `${path} 200`);
    ok(res.headers.get("x-robots-tag")?.includes("noindex"), `${path} noindex header`);
    ok(html.includes('content="noindex, nofollow"'), `${path} noindex meta`);
    ok(!html.includes("data-preview-bar"), `${path} 운영 모드에 미리보기 막대 없음`);
    ok(html.includes("logo"), `${path} 로고`);
    ok(!res.headers.get("set-cookie"), `${path} 쿠키를 발급하지 않음`);
  }
  for (const path of ["/teacher", "/teacher/learners/abc"]) {
    const html = await (await fetch(origin + path)).text();
    ok(html.includes("교사 로그인이 필요해요"), `${path} 미리보기 없이 교사 화면은 인증 필요 상태`);
    ok(!html.includes("소리별 첫 응답"), `${path} 인증 없이 관찰 화면 숨김`);
  }

  const health = await fetch(origin + "/api/health");
  ok(health.status === 200, "health 200");
  ok(health.headers.get("cache-control") === "no-store", "api no-store");
  ok(!health.headers.get("access-control-allow-origin"), "CORS 허용 헤더 없음");
  const body = await health.json();
  ok(body.devStage === 1 && body.database === "not_connected" && body.audio === "not_connected", "health 내용");

  const cross = await fetch(origin + "/api/health", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  ok(cross.status === 403, "다른 origin POST 403");
  const noOrigin = await fetch(origin + "/api/health", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(noOrigin.status === 403, "Origin 없는 POST 403");
  const form = await fetch(origin + "/api/health", { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "a=1" });
  // Astro 기본 checkOrigin(403) 또는 앱 JSON 검사(415) 중 먼저 걸리는 쪽이 막는다.
  ok(form.status === 403 || form.status === 415, `같은 origin 폼 POST 차단 (${form.status})`);
  const sameJson = await fetch(origin + "/api/health", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  ok(sameJson.status !== 403 && sameJson.status !== 415, `같은 origin JSON POST 는 검사를 통과 (${sameJson.status}, 처리기 없음)`);

  const robots = await (await fetch(origin + "/robots.txt")).text();
  ok(robots.includes("Disallow: /"), "robots 차단");
});

await withServer({ LEARN_PREVIEW: "1" }, async (origin) => {
  const html = await (await fetch(origin + "/teacher")).text();
  ok(html.includes("data-preview-bar") && html.includes("실제 교사 인증이 아니에요"), "LEARN_PREVIEW=1 에서 미리보기 막대와 경고 문구");
  ok(html.includes("소리별 첫 응답") && html.includes("담당 학습자가 아직 없어요"), "미리보기 교사 화면은 빈 상태만");
});

console.log(`smoke ok: ${checks} checks`);
