// 연결된 학습자와 그 설정(화면 모양, 사전 언어, 연습 목소리, 문항 종류).
// 설정은 서버의 학습자 id에 저장하므로 기기를 바꿔도 이어진다. 브라우저 저장소는 쓰지 않는다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LearnerSettings, MeView } from "../../server/preview/contract.ts";
import { accountApi, PreviewApiError } from "./api";

export type LearnerStatus = "loading" | "connected" | "not_connected" | "error";

type SettingsValue = LearnerSettings & {
  loaded: boolean;
  status: LearnerStatus;
  me: MeView | null;
  change: (next: Partial<Pick<LearnerSettings, "style" | "dictLanguage" | "practiceVoice" | "exampleReading">>) => Promise<void>;
  adopt: (me: MeView | null) => void;
  reload: () => void;
};

const base: LearnerSettings = { style: "canvas", items: "word", dictLanguage: "ru", practiceVoice: "charon", exampleReading: "spoken" };

// 제공자 밖(계정 DB 없음)에서는 회기를 바꾸지 않도록 문항 종류를 의사단어로 둔다.
const defaults: SettingsValue = {
  ...base,
  style: "proto",
  items: "pseudo",
  loaded: true,
  status: "not_connected",
  me: null,
  change: async () => {},
  adopt: () => {},
  reload: () => {},
};

const SettingsContext = createContext<SettingsValue>(defaults);

export function usePreviewSettings(): SettingsValue {
  return useContext(SettingsContext);
}

export const useLearner = usePreviewSettings;

export function PreviewSettingsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [me, setMe] = useState<MeView | null>(null);
  const [status, setStatus] = useState<LearnerStatus>("loading");
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("loading");
    accountApi
      .me()
      .then((view) => {
        if (cancelled) return;
        setMe(view);
        setStatus("connected");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMe(null);
        setStatus(error instanceof PreviewApiError && error.status === 401 ? "not_connected" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, round]);

  const adopt = useCallback((view: MeView | null) => {
    setMe(view);
    setStatus(view ? "connected" : "not_connected");
  }, []);

  const change = useCallback(async (next: Partial<Pick<LearnerSettings, "style" | "dictLanguage" | "practiceVoice" | "exampleReading">>) => {
    setMe((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...next } } : prev));
    try {
      setMe(await accountApi.saveSettings(next));
    } catch {
      setRound((value) => value + 1);
    }
  }, []);

  const reload = useCallback(() => setRound((value) => value + 1), []);

  const value = useMemo<SettingsValue>(
    () => ({
      ...(me?.settings ?? base),
      loaded: status !== "loading",
      status,
      me,
      change,
      adopt,
      reload,
    }),
    [me, status, change, adopt, reload],
  );
  if (!enabled) return <>{children}</>;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
