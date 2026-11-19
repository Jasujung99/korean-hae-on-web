// 사전 방식 A: 단어 카드 안에서 '사전 풀이'를 펼친다(2026-11-17 결정).
// 내용은 국립국어원 한국어기초사전·표준국어대사전에서 미리 받아 사람이 검수한 정적 자료다. 브라우저는 사전 API를 부르지 않는다.
// 서버가 학습자에게는 승인(approved) 항목만 보내고, 개발 미리보기에서만 검수 전 항목을 함께 보낸다.
// 사전 사이트는 iframe으로 넣지 않고 새 창 링크(↗)로만 연다. 사전 발음 파일은 쓰지 않는다.
// 2026-11-19: 화면에는 한국어기초사전과 내 언어만 풀이로 보이고, 표준국어대사전·네이버 사전은 머리줄 바로가기로만 둔다.
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { DictLanguage, WordDictView } from "../../../server/preview/contract.ts";
import { useLearner } from "../../preview/settings";
import { track } from "../../preview/telemetry";

// 사전 대역어 언어는 러시아어·영어 두 가지. 학습자 설정을 기본으로 펼치고, 바꾸면 설정에 저장한다.
// nation·nationCode는 한국어기초사전 다국어 화면이 스스로 쓰는 값이다(rus=5, eng=6. API의 trans_lang 번호와는 다르다).
const LANGUAGES: Array<{ key: DictLanguage; label: string; name: string; nation: string; nationCode: number }> = [
  { key: "ru", label: "Русский", name: "러시아어", nation: "rus", nationCode: 5 },
  { key: "en", label: "English", name: "영어", nation: "eng", nationCode: 6 },
];

export const DICT_LICENSE = {
  text: "크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스",
  short: "CC BY-SA 2.0 KR",
  url: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
  /** 학습자 설정의 '사전 자료 출처' 칸. 긴 라이선스 설명과 전문 링크는 거기에 둔다. */
  settingsHref: "/settings#dict-license",
} as const;

export type DictLinkTarget = "krdict" | "stdict" | "naver";

/** 한국어기초사전 낱말 화면. 언어를 주면 그 언어의 다국어 사전 화면으로 연다. */
export function krdictHref(targetCode: number, language?: DictLanguage): string {
  const row = language ? LANGUAGES.find((item) => item.key === language) : undefined;
  if (!row) return `https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=${targetCode}`;
  return `https://krdict.korean.go.kr/${row.nation}/dicSearch/SearchView?ParaWordNo=${targetCode}&nation=${row.nation}&nationCode=${row.nationCode}`;
}

/** 머리줄 바로가기: 표준국어대사전(사전 번호가 있을 때만)과 네이버 사전(낱말로 찾기). */
export function dictShortcuts(word: string, dict: WordDictView | null): Array<{ target: Exclude<DictLinkTarget, "krdict">; label: string; href: string }> {
  const links: Array<{ target: Exclude<DictLinkTarget, "krdict">; label: string; href: string }> = [];
  if (dict?.stdict) {
    links.push({
      target: "stdict",
      label: "표준국어대사전",
      href: `https://stdict.korean.go.kr/search/searchView.do?word_no=${dict.stdict.targetCode}&searchKeywordTo=3`,
    });
  }
  links.push({ target: "naver", label: "네이버 사전", href: `https://ko.dict.naver.com/#/search?query=${encodeURIComponent(word)}` });
  return links;
}

function OutLink({ href, className, label, children, onOpen }: { href: string; className: string; label: string; children: ReactNode; onOpen: () => void }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener" aria-label={label} onClick={onOpen}>
      {children}
    </a>
  );
}

export function DictInline({ word, wordId, pos, dict }: { word: string; wordId: string; pos: string; dict: WordDictView | null }) {
  const [open, setOpen] = useState(false);
  const learner = useLearner();
  const language = learner.dictLanguage;
  const languageRow = LANGUAGES.find((row) => row.key === language) ?? LANGUAGES[0]!;
  const panelId = useId();

  const toggle = () => {
    setOpen((value) => {
      if (!value) track("dictionary_opened", { wordId, mode: "inline" });
      return !value;
    });
  };

  const kr = dict?.krdict ?? null;
  const translation = kr?.translations[languageRow.key] ?? null;
  const reviewing = dict !== null && dict.status !== "approved";

  return (
    <section className={open ? "dict-inline is-open" : "dict-inline"}>
      <div className="dict-inline-head">
        <button type="button" className="dict-inline-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          <span>사전 풀이</span>
          <span className="dict-inline-state">{open ? "접기" : "펼치기"}</span>
        </button>
        {open ? (
          <div className="dict-inline-shortcuts">
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
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="dict-inline-panel">
          {reviewing ? (
            <p className="dict-inline-review" role="note">
              검수 전 · 개발 미리보기에서만 보여요. 승인되면 학습자에게 보여요.
            </p>
          ) : null}
          {dict === null ? (
            <p className="dict-inline-empty">이 낱말의 사전 풀이는 아직 준비하고 있어요.</p>
          ) : (
            <>
              <div className="dict-inline-row">
                <p className="dict-inline-source">
                  {kr ? (
                    <OutLink
                      className="tc-ul dict-inline-source-link"
                      href={krdictHref(kr.targetCode)}
                      label="한국어기초사전 새 창으로 열기"
                      onOpen={() => track("dictionary_link_opened", { wordId, target: "krdict" })}
                    >
                      한국어기초사전
                      <span aria-hidden="true"> ↗</span>
                    </OutLink>
                  ) : (
                    "한국어기초사전"
                  )}
                  {kr ? (
                    <small>
                      {kr.pos || pos || "품사 없음"}
                      {kr.grade ? ` · ${kr.grade}` : ""}
                    </small>
                  ) : null}
                </p>
                {kr ? (
                  <>
                    <p className="dict-inline-text">{kr.definition}</p>
                    {kr.example ? <p className="dict-inline-example">{kr.example}</p> : null}
                  </>
                ) : (
                  <p className="dict-inline-empty">한국어기초사전에는 이 낱말 풀이가 없어요.</p>
                )}
              </div>
              <div className="dict-inline-row is-lang">
                <p className="dict-inline-source">내 언어</p>
                <div className="dict-inline-langs" role="group" aria-label="내 언어 고르기">
                  {LANGUAGES.map((row) => (
                    <button key={row.key} type="button" aria-pressed={language === row.key} onClick={() => void learner.change({ dictLanguage: row.key })}>
                      {row.label}
                    </button>
                  ))}
                </div>
                {kr && translation ? (
                  <div className="dict-inline-trans" lang={languageRow.key}>
                    {translation.word ? (
                      <p className="dict-inline-text dict-inline-trans-word">
                        <span>{translation.word}</span>
                        <OutLink
                          className="tc-ul dict-inline-arrow"
                          href={krdictHref(kr.targetCode, languageRow.key)}
                          label={`한국어기초사전 ${languageRow.name} 화면 새 창으로 열기`}
                          onOpen={() => track("dictionary_link_opened", { wordId, target: "krdict", lang: languageRow.key })}
                        >
                          <span aria-hidden="true">↗</span>
                        </OutLink>
                      </p>
                    ) : null}
                    {translation.definition ? <p className="dict-inline-example">{translation.definition}</p> : null}
                  </div>
                ) : (
                  <p className="dict-inline-empty">이 낱말은 아직 {languageRow.name} 풀이가 없어요.</p>
                )}
              </div>
              {/* CC BY-SA는 자료 가까이에 출처와 라이선스 표시를 요구한다. 패널에는 한 줄만 두고 긴 설명은 설정으로 옮긴다. */}
              <p className="dict-inline-credit">
                출처 국립국어원 한국어기초사전 · 표준국어대사전 ·{" "}
                <Link className="tc-ul" to={DICT_LICENSE.settingsHref}>
                  {DICT_LICENSE.short}
                </Link>
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
