// 사전 방식 A: 단어 카드 안에서 '사전 풀이'를 펼친다(2026-11-17 결정).
// 사전 자료는 아직 연결하지 않았다. 펼쳤을 때의 자리와 순서만 실제로 동작한다.
import { useId, useState } from "react";
import type { DictLanguage } from "../../../server/preview/contract.ts";
import { useLearner } from "../../preview/settings";
import { track } from "../../preview/telemetry";

// 사전 대역어 언어는 러시아어·영어 두 가지. 학습자 설정을 기본으로 펼치고, 바꾸면 설정에 저장한다.
const LANGUAGES: Array<{ key: DictLanguage; label: string }> = [
  { key: "ru", label: "Русский" },
  { key: "en", label: "English" },
];

export function DictInline({ word, wordId, pos }: { word: string; wordId: string; pos: string }) {
  const [open, setOpen] = useState(false);
  const learner = useLearner();
  const language = learner.dictLanguage;
  const languageLabel = LANGUAGES.find((row) => row.key === language)?.label ?? "Русский";
  const panelId = useId();

  const toggle = () => {
    setOpen((value) => {
      if (!value) track("dictionary_opened", { wordId, mode: "inline" });
      return !value;
    });
  };

  return (
    <section className={open ? "dict-inline is-open" : "dict-inline"}>
      <button type="button" className="dict-inline-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span>사전 풀이</span>
        <span className="dict-inline-state">{open ? "접기" : "펼치기"}</span>
      </button>
      {open ? (
        <div id={panelId} className="dict-inline-panel">
          <div className="dict-inline-row">
            <p className="dict-inline-source">
              기초사전 <small>{pos || "품사"} · 등급</small>
            </p>
            <p className="dict-inline-empty">[ {word} — 한국어기초사전 뜻풀이가 들어올 자리 ]</p>
          </div>
          <div className="dict-inline-row">
            <p className="dict-inline-source">내 언어</p>
            <div className="dict-inline-langs" role="group" aria-label="내 언어 고르기">
              {LANGUAGES.map((row) => (
                <button key={row.key} type="button" aria-pressed={language === row.key} onClick={() => void learner.change({ dictLanguage: row.key })}>
                  {row.label}
                </button>
              ))}
            </div>
            <p className="dict-inline-empty">[ {languageLabel} 대역어가 들어올 자리 ]</p>
          </div>
          <div className="dict-inline-row">
            <p className="dict-inline-source">
              표준국어대사전 <small>원어 · {pos || "품사"}</small>
            </p>
            <p className="dict-inline-empty">[ {word} — 표준국어대사전 뜻풀이가 들어올 자리 ]</p>
          </div>
          <p className="dict-inline-note">아직 사전을 연결하지 않았어요. 연결하면 출처(국립국어원 한국어기초사전 · 표준국어대사전)를 여기에 적어요.</p>
        </div>
      ) : null}
    </section>
  );
}
