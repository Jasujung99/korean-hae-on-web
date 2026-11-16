import { describe, expect, it } from "vitest";
import { readLearnConfig, toPublicConfig } from "./config.ts";

describe("readLearnConfig", () => {
  it("leaves the origin unset and does not invent a host", () => {
    const config = readLearnConfig({ NODE_ENV: "production" });
    expect(config.origin).toBeNull();
    expect(toPublicConfig(config)).toMatchObject({
      origin: null,
      originSource: "unset",
      activated: false,
      dnsChanged: false,
      screenPreview: false,
      session: "not-issued",
    });
  });

  it("stores only the origin and still reports the host as inactive", () => {
    const config = readLearnConfig({
      NODE_ENV: "production",
      LEARN_APP_ORIGIN: "https://learn.example.test/practice?x=1#token",
    });
    expect(config.origin).toBe("https://learn.example.test");
    expect(toPublicConfig(config).activated).toBe(false);
    expect(toPublicConfig(config).dnsChanged).toBe(false);
  });

  it("rejects credentials and non-http origins without echoing the value", () => {
    expect(() => readLearnConfig({ LEARN_APP_ORIGIN: "https://user:secret@example.test" })).toThrow(
      /must not include credentials/,
    );
    expect(() => readLearnConfig({ LEARN_APP_ORIGIN: "ftp://example.test" })).toThrow(/http or https/);
    expect(() => readLearnConfig({ LEARN_APP_ORIGIN: "not a url" })).toThrow(/absolute http/);
    try {
      readLearnConfig({ LEARN_APP_ORIGIN: "https://user:secret@example.test" });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("secret");
    }
  });

  it("turns preview on outside production unless it is explicitly off", () => {
    expect(readLearnConfig({ NODE_ENV: "development" }).screenPreview).toBe(true);
    expect(readLearnConfig({ NODE_ENV: "development", LEARN_SCREEN_PREVIEW: "0" }).screenPreview).toBe(false);
    expect(readLearnConfig({ NODE_ENV: "production", LEARN_SCREEN_PREVIEW: "1" }).screenPreview).toBe(true);
    expect(readLearnConfig({ NODE_ENV: "production" }).screenPreview).toBe(false);
  });

  it("rejects a bad port without a default fallback", () => {
    expect(readLearnConfig({}).port).toBe(4174);
    expect(() => readLearnConfig({ PORT: "0" })).toThrow(/PORT/);
    expect(() => readLearnConfig({ PORT: "nope" })).toThrow(/PORT/);
  });
});
