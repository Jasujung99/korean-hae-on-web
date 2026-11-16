import { Hono } from "hono";
import { toPublicConfig, type LearnConfig } from "./config.ts";

export function createLearnApp(config: LearnConfig) {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      service: "learn",
      stage: 1,
      persistence: "none",
      session: "not-issued",
    }),
  );

  app.get("/api/config", (c) => c.json(toPublicConfig(config)));

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    console.error("learn api error");
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      console.error(error.name);
    }
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
