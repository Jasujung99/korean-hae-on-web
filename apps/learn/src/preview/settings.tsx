// 미리보기 보기 설정: 화면 스타일(저장소 시안 / 캔버스), 의사단어 소리 방식(고정 음원 / 브라우저 음성),
// 듣고 고르기 문항(낱말 대립쌍 / 의사단어).
// 서버의 미리보기 저장소에 남겨 새로고침해도 유지한다. 비교용이며 운영 설정이 아니다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PreviewSettings } from "../../server/preview/contract.ts";
import { previewApi } from "./api";

type SettingsValue = PreviewSettings & { loaded: boolean; change: (next: Partial<PreviewSettings>) => void };

// 미리보기 밖(제공자 없음)에서는 회기를 바꾸지 않도록 문항 종류를 의사단어로 둔다.
const defaults: SettingsValue = { style: "proto", sound: "file", items: "pseudo", loaded: true, change: () => {} };

const SettingsContext = createContext<SettingsValue>(defaults);

export function usePreviewSettings(): SettingsValue {
  return useContext(SettingsContext);
}

export function PreviewSettingsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [settings, setSettings] = useState<PreviewSettings>({ style: "canvas", sound: "file", items: "word" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    previewApi
      .settings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [enabled]);

  const change = useCallback((next: Partial<PreviewSettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
    previewApi.saveSettings(next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ ...settings, loaded: loaded || !enabled, change }), [settings, loaded, enabled, change]);
  if (!enabled) return <>{children}</>;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
