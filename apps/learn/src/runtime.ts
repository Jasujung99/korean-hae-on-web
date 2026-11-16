import { useEffect, useState } from "react";

export type LearnRuntime = {
  ready: boolean;
  api: "pending" | "ok" | "unavailable";
  origin: string | null;
  screenPreview: boolean;
};

const initialRuntime: LearnRuntime = {
  ready: false,
  api: "pending",
  origin: null,
  screenPreview: false,
};

function parsePublicConfig(value: unknown): { origin: string | null; screenPreview: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.activated !== false || record.dnsChanged !== false || record.session !== "not-issued") {
    return null;
  }
  if (typeof record.screenPreview !== "boolean") return null;
  if (record.origin !== null && typeof record.origin !== "string") return null;
  return {
    origin: record.origin,
    screenPreview: record.screenPreview,
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
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRuntime({
          ready: true,
          api: "unavailable",
          origin: null,
          screenPreview: import.meta.env.DEV,
        });
      });

    return () => controller.abort();
  }, []);

  return runtime;
}

export function originStatus(runtime: LearnRuntime): string {
  if (!runtime.ready || runtime.api === "pending") return "앱 주소 설정을 확인하는 중입니다.";
  if (runtime.api === "unavailable") {
    return "상태 API에 닿지 못했습니다. 화면은 그대로 둘 수 있고, DNS와 배포는 바꾸지 않습니다.";
  }
  if (!runtime.origin) return "앱 주소 설정 없음. DNS와 배포는 바꾸지 않습니다.";
  return `설정된 주소 ${runtime.origin}. 이 값은 DNS와 배포를 바꾸지 않습니다.`;
}
