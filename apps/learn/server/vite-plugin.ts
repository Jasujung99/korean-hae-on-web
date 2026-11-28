import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLearnApp } from "./app.ts";
import { readApprovedDistribution } from "./audio-files.ts";
import { readLearnConfig } from "./config.ts";
import { networkInterfaces } from "node:os";
import { accountsDeps } from "./preview/setup.ts";

const securityHeaders = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
} as const;

function handledByApp(url: string): boolean {
  const pathOnly = url.split("?")[0] ?? "";
  return pathOnly === "/robots.txt" || pathOnly.startsWith("/api/");
}

function mount(middlewares: Connect.Server, devOrigin: string) {
  const config = readLearnConfig(process.env);
  // 개발 서버에서만: 주소가 비어 있으면 이 서버 자신의 주소를 상태 변경 요청의 Origin으로 받는다.
  // 운영 주소·DNS를 뜻하지 않는다.
  if (!config.origin) {
    config.origin = devOrigin;
    config.devOrigins = [devOrigin.replace("//127.0.0.1:", "//localhost:")];
    // 같은 와이파이 휴대폰 시험(LEARN_LAN=1): 이 PC의 내부 주소도 받고, 초대 링크는 그 주소로 만든다.
    if (process.env.LEARN_LAN === "1") {
      const port = new URL(devOrigin).port;
      const lan = Object.values(networkInterfaces())
        .flat()
        .filter((row) => row && row.family === "IPv4" && !row.internal && /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(row.address))
        .map((row) => `http://${row!.address}:${port}`);
      config.devOrigins.push(...lan);
      if (!config.inviteOrigin && lan[0]) config.inviteOrigin = lan[0];
    }
  }
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const app = createLearnApp(
    config,
    {
      readDistribution: (id) => readApprovedDistribution(appRoot, id),
    },
    accountsDeps(appRoot, config),
  );
  const listener = getRequestListener(app.fetch, { hostname: config.host });

  middlewares.use((req, res, next) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      res.setHeader(name, value);
    }
    if (!handledByApp(req.url ?? "")) {
      next();
      return;
    }
    listener(req as IncomingMessage, res as ServerResponse).catch(next);
  });
}

export function learnApiPlugin(): Plugin {
  return {
    name: "learn-api",
    configureServer(server) {
      mount(server.middlewares, `http://127.0.0.1:${server.config.server.port ?? 4174}`);
    },
    configurePreviewServer(server) {
      mount(server.middlewares, `http://127.0.0.1:${server.config.preview.port ?? 4174}`);
    },
  };
}
