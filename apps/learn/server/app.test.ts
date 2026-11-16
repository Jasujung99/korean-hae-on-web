import { describe, expect, it } from "vitest";
import { createLearnApp } from "./app.ts";
import type { LearnConfig } from "./config.ts";

const config: LearnConfig = {
  origin: null,
  screenPreview: false,
  host: "127.0.0.1",
  port: 4174,
};

describe("learn API", () => {
  it("answers health without a session cookie or another origin", async () => {
    const response = await createLearnApp(config).request("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      service: "learn",
      stage: 1,
      persistence: "none",
      session: "not-issued",
    });
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/gemini|supabase|secret|token/);
  });

  it("publishes the injected origin as configuration only", async () => {
    const response = await createLearnApp({
      ...config,
      origin: "http://127.0.0.1:4174",
      screenPreview: true,
    }).request("/api/config");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      origin: "http://127.0.0.1:4174",
      originSource: "LEARN_APP_ORIGIN",
      activated: false,
      dnsChanged: false,
      screenPreview: true,
      session: "not-issued",
    });
  });

  it("does not open unknown API routes", async () => {
    const response = await createLearnApp(config).request("/api/teacher/learners");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("guards mutating API requests and labels every response", async () => {
    const app = createLearnApp({ ...config, origin: "http://127.0.0.1:4174" });

    const health = await app.request("/api/health");
    expect(health.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("access-control-allow-origin")).toBeNull();
    expect(health.headers.get("set-cookie")).toBeNull();

    const robots = await app.request("/robots.txt");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("Disallow: /");
    expect(robots.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const missingOrigin = await app.request("/api/health", { method: "POST" });
    expect(missingOrigin.status).toBe(403);

    const wrongOrigin = await app.request("/api/health", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(wrongOrigin.status).toBe(403);

    const notJson = await app.request("/api/health", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4174", "content-type": "text/plain" },
      body: "{}",
    });
    expect(notJson.status).toBe(415);

    const allowed = await app.request("/api/health", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:4174", "content-type": "application/json; charset=utf-8" },
      body: "{}",
    });
    expect(allowed.status).toBe(404);
    expect(allowed.headers.get("set-cookie")).toBeNull();
    expect(allowed.headers.get("access-control-allow-origin")).toBeNull();

    const options = await app.request("/api/health", { method: "OPTIONS" });
    expect(options.status).not.toBe(403);
    expect(options.status).not.toBe(415);
  });
});
