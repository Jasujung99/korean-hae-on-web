import { useEffect, useState } from "react";

export type LearnRuntime = {
  ready: boolean;
  api: "pending" | "ok" | "unavailable";
  origin: string | null;
  screenPreview: boolean;
  /** 계정 DB가 연결된 서버: 개인 초대·학습 기록·교사 관찰이 실제로 동작한다. */
  accounts: boolean;
};

const initialRuntime: LearnRuntime = {
  ready: false,
  api: "pending",
  origin: null,
  screenPreview: false,
  accounts: false,
};

function parsePublicConfig(value: unknown): { origin: string | null; screenPreview: boolean; accounts: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.activated !== false || record.dnsChanged !== false) return null;
  if (record.session !== "not-issued" && record.session !== "device-cookie") return null;
  if (typeof record.screenPreview !== "boolean") return null;
  if (record.origin !== null && typeof record.origin !== "string") return null;
  return {
    origin: record.origin,
    screenPreview: record.screenPreview,
    accounts: record.accounts === true && record.session === "device-cookie",
  };
}

export function useLearnRuntime(): LearnRuntime {
  const [runtime, setRuntime] = useState<LearnRuntime>(initialRuntime);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/config", {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("config unavailable");
        return parsePublicConfig(await response.json());
      })
      .then((config) => {
        if (!config) throw new Error("config rejected");
        setRuntime({
          ready: true,
          api: "ok",
          origin: config.origin,
          screenPreview: config.screenPreview,
          accounts: config.accounts,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRuntime({
          ready: true,
          api: "unavailable",
          origin: null,
          screenPreview: import.meta.env.DEV,
          accounts: false,
        });
      });

    return () => controller.abort();
  }, []);

  return runtime;
}
