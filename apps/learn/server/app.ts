import { Hono } from "hono";
import { toPublicConfig, type LearnConfig } from "./config.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function applyDocumentHeaders(c: { header: (name: string, value: string) => void }) {
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
}

function isJsonContentType(value: string | undefined): boolean {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json";
}

export function createLearnApp(
  config: LearnConfig,
  audio: { readDistribution?: (id: string) => Uint8Array | null } = {},
) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    applyDocumentHeaders(c);
  });

  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (!config.origin || origin !== config.origin) {
        return c.json({ error: "forbidden" }, 403);
      }
      if (!isJsonContentType(c.req.header("content-type"))) {
        return c.json({ error: "unsupported_media_type" }, 415);
      }
    }
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));

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

  app.get("/api/audio/:id", (c) => {
    const bytes = audio.readDistribution?.(c.req.param("id")) ?? null;
    if (!bytes || bytes.length === 0) {
      return c.json({ error: "audio_not_ready", display: "아직 준비 중" }, 404);
    }
    return c.body(bytes.slice().buffer, 200, { "content-type": "audio/wav" });
  });

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    console.error("learn api error");
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      console.error(error.name);
    }
    applyDocumentHeaders(c);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
