import { describe, expect, it } from "vitest";
import { createLearnApp } from "./app.ts";
import type { LearnConfig } from "./config.ts";

const config: LearnConfig = {
  origin: null,
  screenPreview: false,
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
});
