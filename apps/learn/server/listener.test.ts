import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { getRequestListener } from "@hono/node-server";
import { describe, expect, it } from "vitest";
import { createLearnApp } from "./app.ts";

describe("node request listener", () => {
  it("forwards the body, origin, and response headers the same way in dev and prod", async () => {
    const app = createLearnApp({
      origin: "http://127.0.0.1:4174",
      screenPreview: false,
      host: "127.0.0.1",
      port: 4174,
    });
    const server = createServer(getRequestListener(app.fetch));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4174",
          "content-type": "application/json",
        },
        body: JSON.stringify({ unused: true }),
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(await response.json()).toEqual({ error: "not_found" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
