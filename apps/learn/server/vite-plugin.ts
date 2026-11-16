import type { Connect, Plugin } from "vite";
import { createLearnApp } from "./app.ts";
import { readLearnConfig } from "./config.ts";

function mount(middlewares: Connect.Server) {
  const app = createLearnApp(readLearnConfig(process.env));

  middlewares.use(async (req, res, next) => {
    const url = req.url ?? "";
    const pathOnly = url.split("?")[0] ?? "";
    if (!pathOnly.startsWith("/api")) {
      next();
      return;
    }

    try {
      const hostHeader = req.headers.host;
      const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }

      const request = new Request(`http://${host ?? "127.0.0.1"}${url}`, {
        method: req.method,
        headers,
      });
      const response = await app.fetch(request);
      const type = response.headers.get("content-type");
      res.statusCode = response.status;
      if (type) res.setHeader("content-type", type);
      const cache = response.headers.get("cache-control");
      if (cache) res.setHeader("cache-control", cache);
      const sniff = response.headers.get("x-content-type-options");
      if (sniff) res.setHeader("x-content-type-options", sniff);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      next(error);
    }
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
