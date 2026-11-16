import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import type { Connect, Plugin } from "vite";
import { createLearnApp } from "./app.ts";
import { readLearnConfig } from "./config.ts";

const securityHeaders = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
} as const;

function handledByApp(url: string): boolean {
  const pathOnly = url.split("?")[0] ?? "";
  return pathOnly === "/robots.txt" || pathOnly.startsWith("/api/");
}

function mount(middlewares: Connect.Server) {
  const config = readLearnConfig(process.env);
  const app = createLearnApp(config);
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
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
