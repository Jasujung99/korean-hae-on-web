// 캔버스 단어 카드의 사전 풀이: 한국어기초사전 · Русский · English를 탭 하나로 묶고, 고른 풀이 하나만 종이색 판에 보인다(2026-11-23, C안 수정).
// 자료·링크·출처 규칙은 DictInline과 같다. 사전 사이트는 새 창 링크(↗)로만 열고, 브라우저는 사전 API를 부르지 않는다.
// 표준국어대사전·네이버 사전은 풀이 판 아래 바로가기로만 둔다. 검수 상태 안내 문구는 이 카드에 두지 않는다.
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import type { DictLanguage, WordDictView } from "../../../server/preview/contract.ts";
import { useLearner } from "../../preview/settings";
import { track } from "../../preview/telemetry";
import { DICT_LICENSE, LANGUAGES, OutLink, dictShortcuts, krdictHref } from "../live/DictInline";

export type DictTab = "kr" | DictLanguage;

const TABS: Array<{ key: DictTab; label: string }> = [{ key: "kr", label: "한국어기초사전" }, ...LANGUAGES.map((row) => ({ key: row.key, label: row.label }))];

export function DictTabs({ word, wordId, pos, dict }: { word: string; wordId: string; pos: string; dict: WordDictView | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DictTab>("kr");
  const learner = useLearner();
  const panelId = useId();
  const tabId = useId();
  const tabRefs = useRef<Partial<Record<DictTab, HTMLButtonElement | null>>>({});

  const toggle = () => {
    setOpen((value) => {
      if (!value) track("dictionary_opened", { wordId, mode: "inline" });
      return !value;
    });
  };

  // 언어 탭을 고르면 학습자 설정의 사전 언어도 그 언어로 맞춘다.
  const choose = (key: DictTab, focus = false) => {
    setTab(key);
    if (key !== "kr" && key !== learner.dictLanguage) void learner.change({ dictLanguage: key });
    if (focus) tabRefs.current[key]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((row) => row.key === tab);
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + last) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    choose(TABS[next]!.key, true);
  };

  const kr = dict?.krdict ?? null;
  const languageRow = tab === "kr" ? null : (LANGUAGES.find((row) => row.key === tab) ?? null);
  const translation = kr && languageRow ? kr.translations[languageRow.key] : null;

  return (
    <section className={open ? "dict-inline dict-tabs is-open" : "dict-inline dict-tabs"}>
      <div className="dict-inline-head">
        <button type="button" className="dict-inline-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          <span>사전 풀이</span>
          <span className="dict-inline-state">{open ? "접기" : "펼치기"}</span>
        </button>
      </div>
      {open ? (
        <div id={panelId} className="dict-tabs-panel">
          {dict === null ? (
            <p className="dict-inline-empty">이 낱말의 사전 풀이는 아직 준비하고 있어요.</p>
          ) : (
            <>
              <div className="dict-tabs-list" role="tablist" aria-label="사전 풀이 고르기">
                {TABS.map((row) => (
                  <button
                    key={row.key}
                    ref={(node) => {
                      tabRefs.current[row.key] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`${tabId}-${row.key}`}
                    className={row.key === "kr" ? undefined : "is-lang"}
                    aria-selected={tab === row.key}
                    aria-controls={`${tabId}-panel`}
                    tabIndex={tab === row.key ? 0 : -1}
                    onClick={() => choose(row.key)}
                    onKeyDown={onTabKey}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
              <div
                key={tab}
                id={`${tabId}-panel`}
                role="tabpanel"
                aria-labelledby={`${tabId}-${tab}`}
                className={languageRow ? "dict-tabs-sheet is-lang" : "dict-tabs-sheet"}
                lang={languageRow ? languageRow.key : undefined}
              >
                {languageRow === null ? (
                  kr ? (
                    <>
                      <p className="dict-tabs-meta">
                        <b>{word}</b>
                        {kr.pos || pos ? <span className="dict-tabs-pos">{kr.pos || pos}</span> : null}
                        {kr.grade ? <span>{kr.grade}</span> : null}
                      </p>
                      <p className="dict-inline-text">{kr.definition}</p>
                      {kr.example ? <p className="dict-inline-example">{kr.example}</p> : null}
                    </>
                  ) : (
                    <p className="dict-inline-empty">한국어기초사전에는 이 낱말 풀이가 없어요.</p>
                  )
                ) : translation ? (
                  <>
                    <p className="dict-tabs-meta">
                      {translation.word ? <b>{translation.word}</b> : null}
                      <span lang="ko">{languageRow.name} 풀이</span>
                    </p>
                    {translation.definition ? <p className="dict-inline-example">{translation.definition}</p> : null}
                  </>
                ) : (
                  <p className="dict-inline-empty" lang="ko">
                    이 낱말은 아직 {languageRow.name} 풀이가 없어요.
                  </p>
                )}
              </div>
            </>
          )}
          <div className="dict-tabs-links">
            {kr ? (
              <OutLink
                className="tc-ul"
                href={krdictHref(kr.targetCode, languageRow?.key)}
                label={languageRow ? `한국어기초사전 ${languageRow.name} 화면 새 창으로 열기` : "한국어기초사전 새 창으로 열기"}
                onOpen={() => track("dictionary_link_opened", languageRow ? { wordId, target: "krdict", lang: languageRow.key } : { wordId, target: "krdict" })}
              >
                한국어기초사전
                <span aria-hidden="true"> ↗</span>
              </OutLink>
            ) : null}
            {dictShortcuts(word, dict).map((link) => (
              <OutLink
                key={link.target}
                className="tc-ul"
                href={link.href}
                label={`${link.label} 새 창으로 열기`}
                onOpen={() => track("dictionary_link_opened", { wordId, target: link.target })}
              >
                {link.label}
                <span aria-hidden="true"> ↗</span>
              </OutLink>
            ))}
          </div>
          {dict !== null ? (
            /* CC BY-SA는 자료 가까이에 출처와 라이선스 표시를 요구한다. 긴 설명은 설정에 둔다. */
            <p className="dict-inline-credit">
              출처 국립국어원 한국어기초사전 · 표준국어대사전 ·{" "}
              <Link className="tc-ul" to={DICT_LICENSE.settingsHref}>
                {DICT_LICENSE.short}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
