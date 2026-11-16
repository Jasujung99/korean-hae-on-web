// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLearnRuntime } from "./runtime";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useLearnRuntime", () => {
  it("keeps a configured origin inactive and honors the server preview flag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          origin: "http://127.0.0.1:4174",
          originSource: "LEARN_APP_ORIGIN",
          activated: false,
          dnsChanged: false,
          screenPreview: false,
          session: "not-issued",
        }),
      ),
    );

    const { result } = renderHook(() => useLearnRuntime());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.api).toBe("ok");
    expect(result.current.origin).toBe("http://127.0.0.1:4174");
    expect(result.current.screenPreview).toBe(false);
  });

  it("drops a payload that claims the origin is already active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          origin: "http://127.0.0.1:4174",
          activated: true,
          dnsChanged: false,
          screenPreview: true,
          session: "not-issued",
        }),
      ),
    );

    const { result } = renderHook(() => useLearnRuntime());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.api).toBe("unavailable");
    expect(result.current.origin).toBeNull();
  });
});
