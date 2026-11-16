// 루트 node_modules 없이 학습 앱이 혼자 설치·빌드·시험되는지 확인한다(CI와 같은 조건).
// 현재 커밋(HEAD)을 git archive 로 임시 폴더에 풀고, 루트 의존성은 설치하지 않은 채
// apps/learn 에서 npm ci → build → test → test:smoke 를 실행한다.
// 사용: npm run verify:clean   (커밋되지 않은 변경은 검사 대상이 아님)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const dir = mkdtempSync(join(tmpdir(), "haeon-learn-clean-"));
const keep = process.argv.includes("--keep");

try {
  execFileSync("sh", ["-c", `git -C "${repoRoot}" archive HEAD | tar -x -C "${dir}"`], { stdio: "inherit" });
  if (existsSync(join(dir, "node_modules"))) throw new Error("임시 복사본에 루트 node_modules 가 있으면 안 됩니다.");
  const app = join(dir, "apps/learn");
  console.log(`\n[verify:clean] HEAD ${head} → ${dir} (루트 node_modules 없음)\n`);
  for (const script of [["ci"], ["run", "build"], ["test"], ["run", "test:smoke"]]) {
    console.log(`\n[verify:clean] npm ${script.join(" ")}`);
    run("npm", script, app);
  }
  if (existsSync(join(dir, "node_modules"))) throw new Error("학습 앱 설치가 루트 node_modules 를 만들었습니다.");
  console.log(`\n[verify:clean] ok: 루트 node_modules 없이 npm ci·build·test·test:smoke 통과 (HEAD ${head})`);
} finally {
  if (!keep) rmSync(dir, { recursive: true, force: true });
}
