import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function npmCliPath() {
  if (process.env.npm_execpath) return process.env.npm_execpath;
  const nextToNode = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const unixLib = join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(nextToNode)) return nextToNode;
  if (existsSync(unixLib)) return unixLib;
  throw new Error("npm CLI was not found next to node");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: appRoot, shell: false, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readBody(response) {
  return response.text();
}

async function main() {
  await run(process.execPath, [npmCliPath(), "run", "build"]);

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(appRoot, "dist", "server", "index.js")], {
    cwd: appRoot,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      LEARN_APP_ORIGIN: origin,
      LEARN_SCREEN_PREVIEW: "0",
    },
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });

  try {
    const started = Date.now();
    while (!logs.includes("learn app http")) {
      if (child.exitCode !== null) throw new Error("production server exited before it was ready");
      if (Date.now() - started > 15000) throw new Error("production server did not start");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const routes = ["/", "/join", "/practice", "/compare", "/finish", "/dictionary", "/teach", "/teach/detail"];
    for (const route of routes) {
      const response = await fetch(`${origin}${route}`);
      const body = await readBody(response);
      assert(response.status === 200, `${route} returned ${response.status}`);
      assert(body.includes('id="root"'), `${route} did not return the app shell`);
      assert(response.headers.get("x-robots-tag") === "noindex, nofollow", `${route} is missing noindex`);
      assert(response.headers.get("x-frame-options") === "DENY", `${route} is missing frame denial`);
      assert(response.headers.get("x-content-type-options") === "nosniff", `${route} is missing nosniff`);
      assert(response.headers.get("set-cookie") === null, `${route} set a cookie`);
      assert(response.headers.get("access-control-allow-origin") === null, `${route} sent a CORS header`);
      if (route === "/teach" || route === "/teach/detail") {
        assert(response.headers.get("content-type")?.includes("text/html"), `${route} was not HTML`);
      }
    }

    const robots = await fetch(`${origin}/robots.txt`);
    assert(robots.status === 200, "robots.txt was not served");
    assert((await robots.text()).includes("Disallow: /"), "robots.txt does not disallow the site");
    assert(robots.headers.get("set-cookie") === null, "robots.txt set a cookie");

    const health = await fetch(`${origin}/api/health`);
    assert(health.status === 200, "health failed");
    assert(health.headers.get("x-robots-tag") === "noindex, nofollow", "health is missing noindex");
    assert(health.headers.get("set-cookie") === null, "health set a cookie");
    assert(health.headers.get("access-control-allow-origin") === null, "health sent a CORS header");

    const missingOrigin = await fetch(`${origin}/api/health`, { method: "POST" });
    assert(missingOrigin.status === 403, `missing Origin returned ${missingOrigin.status}`);

    const wrongOrigin = await fetch(`${origin}/api/health`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    assert(wrongOrigin.status === 403, `wrong Origin returned ${wrongOrigin.status}`);

    const notJson = await fetch(`${origin}/api/health`, {
      method: "POST",
      headers: { origin, "content-type": "text/plain" },
      body: "{}",
    });
    assert(notJson.status === 415, `non-JSON returned ${notJson.status}`);

    for (const route of ["/teach", "/teach/detail"]) {
      await run(process.execPath, [fileURLToPath(import.meta.url)], {
        env: {
          ...process.env,
          LEARN_SMOKE_ORIGIN: origin,
          LEARN_SMOKE_ROUTE: route,
        },
        stdio: "inherit",
      });
    }
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function renderProductionRoute(origin, route) {
  const { JSDOM } = await import("jsdom");
  const html = readFileSync(join(appRoot, "dist", "client", "index.html"), "utf8");
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/);
  assert(script, "built client script was not found");
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${origin}${route}`,
    pretendToBeVisual: true,
  });
  for (const name of ["MutationObserver", "HTMLElement", "Node", "Element", "SVGElement", "DocumentFragment"]) {
    globalThis[name] = dom.window[name];
  }
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  const nodeFetch = globalThis.fetch;
  const fetchFrom = (input, init) => nodeFetch(new URL(String(input), origin), init);
  globalThis.fetch = fetchFrom;

  await import(pathToFileURL(join(appRoot, "dist", "client", script[1].replace(/^\/+/, ""))).href);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const text = dom.window.document.body.textContent ?? "";
  assert(text.includes("교사 인증 전"), `${route} did not require teacher auth`);
  assert(!text.includes("개발 미리보기"), `${route} showed the preview role switch`);
  assert(!text.includes("배정된 학습자가 없습니다"), `${route} showed the preview learner list`);
}

if (process.env.LEARN_SMOKE_ROUTE) {
  renderProductionRoute(process.env.LEARN_SMOKE_ORIGIN, process.env.LEARN_SMOKE_ROUTE).catch((error) => {
    console.error(error instanceof Error ? error.message : "render failed");
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "smoke failed");
    process.exit(1);
  });
}
