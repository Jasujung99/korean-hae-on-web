// 사전 방식 A: 단어 카드 안에서 '사전 풀이'를 펼친다(2026-11-17 결정).
// 내용은 국립국어원 한국어기초사전·표준국어대사전에서 미리 받아 사람이 검수한 정적 자료다. 브라우저는 사전 API를 부르지 않는다.
// 서버가 학습자에게는 승인(approved) 항목만 보내고, 개발 미리보기에서만 검수 전 항목을 함께 보낸다.
// 사전 사이트는 iframe으로 넣지 않고 새 창 링크로만 연다. 사전 발음 파일은 쓰지 않는다.
import { useId, useState } from "react";
import type { DictLanguage, WordDictView } from "../../../server/preview/contract.ts";
import { useLearner } from "../../preview/settings";
import { track } from "../../preview/telemetry";

// 사전 대역어 언어는 러시아어·영어 두 가지. 학습자 설정을 기본으로 펼치고, 바꾸면 설정에 저장한다.
const LANGUAGES: Array<{ key: DictLanguage; label: string; name: string }> = [
  { key: "ru", label: "Русский", name: "러시아어" },
  { key: "en", label: "English", name: "영어" },
];

export const DICT_LICENSE = {
  text: "크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스",
  url: "https://creativecommons.org/licenses/by-sa/2.0/kr/",
} as const;

export type DictLinkTarget = "krdict" | "stdict" | "naver";

/** 사전에서 더 보기: 새 창으로 여는 세 곳. 사전 번호가 없으면 그 사전 링크는 빼고, 네이버는 낱말로 찾는다. */
export function dictLinks(word: string, dict: WordDictView | null): Array<{ target: DictLinkTarget; label: string; href: string }> {
  const links: Array<{ target: DictLinkTarget; label: string; href: string }> = [];
  if (dict?.krdict) {
    links.push({
      target: "krdict",
      label: "한국어기초사전",
      href: `https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=${dict.krdict.targetCode}`,
    });
  }
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

export function DictInline({ word, wordId, pos, dict }: { word: string; wordId: string; pos: string; dict: WordDictView | null }) {
  const [open, setOpen] = useState(false);
  const [stdictOpen, setStdictOpen] = useState(false);
  const learner = useLearner();
  const language = learner.dictLanguage;
  const languageRow = LANGUAGES.find((row) => row.key === language) ?? LANGUAGES[0]!;
  const panelId = useId();
  const stdictId = useId();

  const toggle = () => {
    setOpen((value) => {
      if (!value) track("dictionary_opened", { wordId, mode: "inline" });
      return !value;
    });
  };

  const kr = dict?.krdict ?? null;
  const st = dict?.stdict ?? null;
  const translation = kr?.translations[languageRow.key] ?? null;
  const reviewing = dict !== null && dict.status !== "approved";

  return (
    <section className={open ? "dict-inline is-open" : "dict-inline"}>
      <button type="button" className="dict-inline-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span>사전 풀이</span>
        <span className="dict-inline-state">{open ? "접기" : "펼치기"}</span>
      </button>
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
                  한국어기초사전{" "}
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
                {translation ? (
                  <div className="dict-inline-trans" lang={languageRow.key}>
                    {translation.word ? <p className="dict-inline-text">{translation.word}</p> : null}
                    {translation.definition ? <p className="dict-inline-example">{translation.definition}</p> : null}
                  </div>
                ) : (
                  <p className="dict-inline-empty">이 낱말은 아직 {languageRow.name} 풀이가 없어요.</p>
                )}
              </div>
              {st ? (
                <div className="dict-inline-row">
                  <button
                    type="button"
                    className="tc-ul dict-inline-more"
                    aria-expanded={stdictOpen}
                    aria-controls={stdictId}
                    onClick={() => setStdictOpen((value) => !value)}
                  >
                    {stdictOpen ? "표준국어대사전 풀이 접기" : "표준국어대사전 풀이 펼치기"}
                  </button>
                  {stdictOpen ? (
                    <div id={stdictId} className="dict-inline-sub">
                      <p className="dict-inline-source">
                        표준국어대사전{" "}
                        <small>
                          {[st.origin, st.pos, st.pronunciation ? `[${st.pronunciation}]` : ""].filter(Boolean).join(" · ")}
                        </small>
                      </p>
                      <p className="dict-inline-text">{st.definition}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="dict-inline-row">
                  <p className="dict-inline-source">표준국어대사전</p>
                  <p className="dict-inline-empty">표준국어대사전에는 이 낱말 풀이가 없어요.</p>
                </div>
              )}
            </>
          )}
          <div className="dict-inline-more-links">
            <p className="dict-inline-source">사전에서 더 보기</p>
            <div className="dict-inline-links">
              {dictLinks(word, dict).map((link) => (
                <a
                  key={link.target}
                  className="tc-ul"
                  href={link.href}
                  target="_blank"
                  rel="noopener"
                  onClick={() => track("dictionary_link_opened", { wordId, target: link.target })}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          {dict !== null ? (
            <div className="dict-inline-credit">
              <p className="dict-inline-note">
                출처: 국립국어원 한국어기초사전 · 표준국어대사전. {DICT_LICENSE.text}(CC BY-SA 2.0 KR)에 따라 옮겼어요.
              </p>
              <a className="tc-ul" href={DICT_LICENSE.url} target="_blank" rel="noopener">
                라이선스 전문 보기
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
