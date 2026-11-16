import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLearnApp } from "./app.ts";
import { readLearnConfig } from "./config.ts";

// Dev uses Vite. This entry is the production server, so an unset NODE_ENV stays production.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(here, "../client");
const indexPath = resolve(clientDir, "index.html");

let config: ReturnType<typeof readLearnConfig>;
try {
  config = readLearnConfig(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : "invalid configuration");
  process.exit(1);
}

const app = createLearnApp(config);

app.use("*", serveStatic({ root: clientDir }));

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api")) {
    return c.json({ error: "not_found" }, 404);
  }
  const html = await readFile(indexPath, "utf8");
  return c.html(html);
});

async function main() {
  try {
    await access(indexPath);
  } catch {
    console.error("dist/client/index.html is missing. Run npm run build in apps/learn first.");
    process.exit(1);
  }

  serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    console.log(`learn app http://${config.host}:${info.port}`);
    console.log(config.origin ? "LEARN_APP_ORIGIN is set" : "LEARN_APP_ORIGIN is unset");
    console.log(config.screenPreview ? "screen preview is on" : "screen preview is off");
  });
}

void main();
