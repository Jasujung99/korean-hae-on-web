// 같은 와이파이 휴대폰 시험용 개발 서버: 모든 네트워크 주소에서 받고, 초대 링크를 이 PC의 내부 주소로 만든다.
// 운영 배포·DNS와 관계없다. 시험이 끝나면 서버를 끄고, 방화벽 허용을 되돌려도 된다.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vite = require.resolve("vite/bin/vite.js");
const child = spawn(process.execPath, [vite, "--host", "0.0.0.0", "--port", "4174", "--strictPort"], {
  stdio: "inherit",
  env: { ...process.env, LEARN_LAN: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
