// 만든 음원 대시보드(목소리 화면의 '만든 음원' 탭).
// audio/raw 폴더의 검수 전 초안을 목소리·묶음별로 보여 준다. 생성은 부르지 않는다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AudioCellView, AudioInventoryView, AudioUnitKind } from "../../../server/preview/contract.ts";
import { teacherApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";

const KIND_LABEL: Record<AudioUnitKind | "audition" | "other", string> = {
  pseudoword: "의사단어",
  syllable: "첫 듣기 음절",
  word: "낱말",
  sentence: "예문",
  audition: "목소리 표본",
  other: "그 밖",
};

/** 같은 틀의 소리끼리 이만큼 넘게 길이가 다르면 길이로 답을 알 수 있다. */
const SPREAD_WARN = 25;
const PAGE = 120;

function seconds(ms: number | null): string {
  return ms === null ? "-" : `${(ms / 1000).toFixed(2)}초`;
}

function totalTime(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}분 ${total % 60}초` : `${total}초`;
}

function stamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Blade() {
  return (
    <svg className="tc-blade" viewBox="0 0 40 10" aria-hidden="true">
      <path d="M0 10C12 3 28 0 40 0C30 6 14 11 0 10Z" />
    </svg>
  );
}

function Stat({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
  return (
    <div className="tc-stat">
      <p className="tc-stat-label">{label}</p>
      <p className="tc-stat-value">
        <strong>{value}</strong>
        <span>{unit}</span>
      </p>
    </div>
  );
}

function Section({ num, title, note, children, id }: { num: string; title: string; note?: string; children: ReactNode; id?: string }) {
  return (
    <section className="tc-section" id={id}>
      <h3>
        <span className="tc-num">{num}</span>
        <span>{title}</span>
        {note ? <small>{note}</small> : null}
      </h3>
      {children}
    </section>
  );
}

type Row = {
  key: string;
  text: string;
  kind: AudioUnitKind | "audition" | "other";
  group: string;
  column: string;
  columnLabel: string;
  cell: AudioCellView | null;
};

type Filters = { column: string; kind: string; group: string; status: "ready" | "missing" | "all"; query: string };

const START: Filters = { column: "all", kind: "all", group: "all", status: "ready", query: "" };

export function AudioDashboard({ practiceVoiceKey }: { practiceVoiceKey: string | null }) {
  const practice = usePractice();
  const [view, setView] = useState<AudioInventoryView | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<Filters>(START);
  const [lengthColumn, setLengthColumn] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [copied, setCopied] = useState<string | null>(null);
  const [methodVoiceChoice, setMethodVoice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setFailed(false);
    teacherApi
      .audioInventory()
      .then(setView)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  const rows: Row[] = useMemo(() => {
    if (!view) return [];
    const out: Row[] = [];
    for (const unit of view.units) {
      for (const column of view.columns) {
        out.push({
          key: `${unit.base}:${column.key}`,
          text: unit.text,
          kind: unit.kind,
          group: unit.groupId,
          column: column.key,
          columnLabel: column.voice,
          cell: unit.cells[column.key] ?? null,
        });
      }
    }
    for (const row of view.auditions) {
      for (const [style, cell] of [
        ["flat", row.flat],
        ["plain", row.plain],
      ] as const) {
        out.push({
          key: `audition:${row.voice}:${style}`,
          text: `${row.voice} · ${style === "flat" ? "평평 낭독" : "지시 없음"}`,
          kind: "audition",
          group: "audition",
          column: "audition",
          columnLabel: row.voice,
          cell,
        });
      }
    }
    for (const cell of view.others) {
      out.push({ key: `other:${cell.id}`, text: cell.text, kind: "other", group: "other", column: "other", columnLabel: cell.voice, cell });
    }
    return out;
  }, [view]);

  const shown = useMemo(() => {
    const query = filters.query.trim();
    return rows.filter(
      (row) =>
        (filters.column === "all" || row.column === filters.column) &&
        (filters.kind === "all" || row.kind === filters.kind) &&
        (filters.group === "all" || row.group === filters.group) &&
        (filters.status === "all" || (filters.status === "ready" ? row.cell !== null : row.cell === null)) &&
        (!query || row.text.includes(query) || (row.cell?.id ?? "").includes(query)),
    );
  }, [rows, filters]);

  useEffect(() => setLimit(PAGE), [filters]);

  if (failed) {
    return (
      <div className="tc-page">
        <p className="notice" role="status">
          음원 목록을 불러오지 못했어요. 미리보기 서버가 켜져 있는지 확인해 주세요.
        </p>
      </div>
    );
  }
  if (!view) return <p className="tc-label">음원 목록을 읽고 있어요…</p>;

  const groupLabel = (id: string) => view.groups.find((group) => group.id === id)?.label ?? KIND_LABEL[id as "audition"] ?? id;
  const topVoices = view.totals.byVoice.slice(0, 2);
  const restFiles = view.totals.byVoice.slice(2).reduce((sum, row) => sum + row.files, 0);
  const lengthKey =
    lengthColumn ??
    [...view.columns].sort(
      (a, b) =>
        view.lengthChecks.filter((check) => check.column === b.key).length -
        view.lengthChecks.filter((check) => check.column === a.key).length,
    )[0]?.key ??
    "";
  const checks = view.lengthChecks.filter((check) => check.column === lengthKey);
  const flagged = view.lengthChecks.filter((check) => (check.spreadPct ?? 0) >= SPREAD_WARN).length;
  const busy = practice.playing !== null;
  const methodVoice =
    methodVoiceChoice ?? view.methods.find((row) => row.voiceKey === practiceVoiceKey)?.voiceKey ?? view.methods[0]?.voiceKey ?? null;
  const methodRow = view.methods.find((row) => row.voiceKey === methodVoice) ?? null;

  const focus = (next: Partial<Filters>) => {
    setFilters({ ...START, status: "all", ...next });
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="tc-page audio-dash">
      <div className="tc-head">
        <div>
          <p className="tc-label">개발 미리보기 · 검수 전 초안</p>
          <h2 className="tc-title">만든 음원</h2>
        </div>
        <p className="tc-label">
          <code>{view.rawDir}</code> 폴더를 읽어요 · 마지막 확인 {stamp(new Date().toISOString())}{" "}
          <button type="button" className="tc-ul" onClick={load}>
            다시 읽기
          </button>
        </p>
      </div>
      <div className="tc-rule" />

      <div className="tc-stats four">
        <Stat label="만든 파일" value={view.totals.files} unit="개" />
        <Stat label="모두 합친 길이" value={totalTime(view.totals.durationMs)} unit="" />
        <Stat
          label="마지막으로 만든 때"
          value={stamp(view.totals.lastGeneratedAt).split(" ")[0]}
          unit={stamp(view.totals.lastGeneratedAt).split(" ")[1] ?? ""}
        />
        <Stat
          label="목소리별"
          value={topVoices[0]?.files ?? 0}
          unit={`${topVoices[0]?.voice ?? ""}${topVoices[1] ? ` · ${topVoices[1].voice} ${topVoices[1].files}` : ""}${
            restFiles ? ` · 그 밖 ${restFiles}` : ""
          }`}
        />
      </div>

      <Section num="01" title="준비 현황" note="연습에 필요한 음원 / 목소리별 · 칸을 누르면 아래 목록이 그 칸으로 좁혀져요">
        <div className="tc-table-wrap">
          <table className="tc-table ad-matrix">
            <thead>
              <tr>
                <th scope="col">묶음</th>
                {view.columns.map((column) => (
                  <th key={column.key} scope="col" className={column.key === practiceVoiceKey ? "is-current" : undefined}>
                    {column.label}
                    {column.key === practiceVoiceKey ? <small> · 연습 중</small> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.groups.map((group) => (
                <tr key={group.id}>
                  <th scope="row">
                    {group.label}
                    <small> {group.total}개</small>
                  </th>
                  {view.columns.map((column) => {
                    const ready = group.ready[column.key] ?? 0;
                    const legacyNone = column.key === "legacy" && ready === 0;
                    const percent = group.total ? Math.round((ready / group.total) * 100) : 0;
                    return (
                      <td key={column.key} className={column.key === practiceVoiceKey ? "is-current" : undefined}>
                        {legacyNone ? (
                          <span className="tc-none">-</span>
                        ) : (
                          <button
                            type="button"
                            className="ad-cell"
                            onClick={() => focus({ group: group.id, column: column.key })}
                            aria-label={`${group.label} ${column.voice} ${ready}/${group.total}, 목록 보기`}
                          >
                            <span className={ready === group.total ? "ad-count is-full" : ready === 0 ? "ad-count is-empty" : "ad-count"}>
                              {ready}/{group.total}
                            </span>
                            <span className="ad-bar" aria-hidden="true">
                              <i style={{ width: `${percent}%` }} />
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tc-label">
          예전 초안(Iapetus)은 처음 시험할 때 만든 의사단어와 Stage 1 일부만 있어요. 목소리 표본 {view.auditions.length}개
          {view.others.length ? ` · 어디에도 속하지 않는 파일 ${view.others.length}개` : ""}는 아래 목록에 있어요.
        </p>
      </Section>

      <Section
        num="02"
        title="길이 비교"
        note={`같은 틀의 소리끼리 길이가 ${SPREAD_WARN}% 넘게 다르면 소리 말고 길이로 답을 알 수 있어요 · 표시 ${flagged}곳`}
      >
        <div className="tc-toggle" role="group" aria-label="길이 비교 목소리">
          {view.columns
            .filter((column) => view.lengthChecks.some((check) => check.column === column.key))
            .map((column) => (
              <button key={column.key} type="button" aria-pressed={lengthKey === column.key} onClick={() => setLengthColumn(column.key)}>
                <span>{column.voice}</span>
                {lengthKey === column.key ? <Blade /> : <span className="tc-blade-gap" />}
              </button>
            ))}
        </div>
        {checks.length > 0 ? (
          <div className="tc-table-wrap">
            <table className="tc-table ad-lengths">
              <thead>
                <tr>
                  <th scope="col">비교 틀</th>
                  <th scope="col">소리별 길이</th>
                  <th scope="col" className="num">
                    차이
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => {
                  const max = Math.max(...check.items.map((item) => item.durationMs ?? 0), 1);
                  const warn = (check.spreadPct ?? 0) >= SPREAD_WARN;
                  return (
                    <tr key={check.label} className={warn ? "is-warn" : undefined}>
                      <th scope="row">{check.label}</th>
                      <td>
                        <div className="ad-len-list">
                          {check.items.map((item) => (
                            <span key={item.text} className="ad-len">
                              <b>{item.text}</b>
                              <span className="ad-len-bar" aria-hidden="true">
                                <i style={{ width: `${Math.round(((item.durationMs ?? 0) / max) * 100)}%` }} />
                              </span>
                              <em>{seconds(item.durationMs)}</em>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num">
                        {check.spreadPct === null ? "-" : `${check.spreadPct}%`}
                        {warn ? <span className="ad-flag">차이 큼</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tc-empty">이 목소리로 비교할 음원이 아직 없어요.</p>
        )}
      </Section>

      <Section
        num="03"
        title="의사단어 만드는 방식 비교"
        note="하나씩 만든 것 / 세 소리를 묶어 읽혀 자른 것 / 아홉 소리를 한 번에 읽혀 자른 것"
      >
        {view.methods.length === 0 ? (
          <p className="tc-empty">비교할 음원이 아직 없어요. 아래 05의 첫 명령으로 만들 수 있어요.</p>
        ) : (
          <>
            <div className="tc-toggle" role="group" aria-label="비교할 목소리">
              {view.methods.map((row) => (
                <button key={row.voiceKey} type="button" aria-pressed={methodVoice === row.voiceKey} onClick={() => setMethodVoice(row.voiceKey)}>
                  <span>{row.voice}</span>
                  {methodVoice === row.voiceKey ? <Blade /> : <span className="tc-blade-gap" />}
                </button>
              ))}
            </div>
            {methodRow ? (
              <>
                {methodRow.allFull?.ref ? (
                  <p className="tc-label">
                    아홉 소리를 한 번에 읽힌 원본({seconds(methodRow.allFull.durationMs)}){" "}
                    <button
                      type="button"
                      className="ad-play"
                      disabled={busy}
                      onClick={() => void practice.playRole(methodRow.allFull?.ref ?? null, "voice", "아홉 소리 원본")}
                    >
                      원본 듣기
                    </button>
                  </p>
                ) : null}
                <div className="tc-table-wrap">
                  <table className="tc-table ad-methods">
                    <thead>
                      <tr>
                        <th scope="col">틀</th>
                        <th scope="col">방식</th>
                        <th scope="col">세 소리(누르면 들려줘요)</th>
                        <th scope="col" className="num">
                          길이 차이
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {methodRow.frames.flatMap((frame) =>
                        frame.methods.map((method, index) => {
                          const warn = (method.spreadPct ?? 0) >= SPREAD_WARN;
                          return (
                            <tr key={`${frame.lead}-${method.method}`} className={warn ? "is-warn" : undefined}>
                              {index === 0 ? (
                                <th scope="rowgroup" rowSpan={frame.methods.length}>
                                  {frame.lead}자 · {frame.lead}차 · {frame.lead}짜
                                </th>
                              ) : null}
                              <td>
                                {method.label}
                                {method.full?.ref ? (
                                  <button
                                    type="button"
                                    className="tc-ul"
                                    disabled={busy}
                                    onClick={() => void practice.playRole(method.full?.ref ?? null, "voice", "묶음 원본")}
                                  >
                                    원본
                                  </button>
                                ) : null}
                              </td>
                              <td>
                                <div className="ad-method-items">
                                  {method.items.map((item) =>
                                    item.cell?.ref ? (
                                      <button
                                        key={item.text}
                                        type="button"
                                        className="ad-play"
                                        disabled={busy}
                                        onClick={() => void practice.playRole(item.cell?.ref ?? null, "voice", item.text)}
                                      >
                                        {item.text} <small>{seconds(item.cell.durationMs)}</small>
                                      </button>
                                    ) : (
                                      <span key={item.text} className="ad-missing">
                                        {item.text} 없음
                                      </span>
                                    ),
                                  )}
                                </div>
                              </td>
                              <td className="num">
                                {method.spreadPct === null ? "-" : `${method.spreadPct}%`}
                                {warn ? <span className="ad-flag">차이 큼</span> : null}
                              </td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="tc-label">
                  묶어 읽히면 마지막 소리에 문장 끝 억양(내려감)이 붙을 수 있어요. 세 소리를 번갈아 들으며 셋째 소리만 다르게
                  들리지 않는지 살펴보세요. 하나씩 만든 파일은 앞뒤 쉼이 길어 길이가 더 길게 나와요.
                </p>
              </>
            ) : null}
          </>
        )}
      </Section>

      <div ref={listRef}>
        <Section num="04" title="음원 목록" note={`${shown.length}개 · 칸이 비어 있으면 아직 만들지 않은 것`}>
          <div className="ad-filters">
            <label>
              목소리
              <select value={filters.column} onChange={(event) => setFilters({ ...filters, column: event.target.value })}>
                <option value="all">전체</option>
                {view.columns.map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
                <option value="audition">목소리 표본</option>
                {view.others.length ? <option value="other">그 밖</option> : null}
              </select>
            </label>
            <label>
              종류
              <select value={filters.kind} onChange={(event) => setFilters({ ...filters, kind: event.target.value, group: "all" })}>
                <option value="all">전체</option>
                {(Object.keys(KIND_LABEL) as Array<keyof typeof KIND_LABEL>).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              묶음
              <select value={filters.group} onChange={(event) => setFilters({ ...filters, group: event.target.value })}>
                <option value="all">전체</option>
                {view.groups
                  .filter((group) => filters.kind === "all" || group.kind === filters.kind)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="tc-toggle" role="group" aria-label="상태">
              {(
                [
                  ["ready", "만든 것"],
                  ["missing", "빠진 것"],
                  ["all", "모두"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={filters.status === value} onClick={() => setFilters({ ...filters, status: value })}>
                  <span>{label}</span>
                  {filters.status === value ? <Blade /> : <span className="tc-blade-gap" />}
                </button>
              ))}
            </div>
            <label className="ad-search">
              찾기
              <input
                type="search"
                value={filters.query}
                placeholder="글자나 파일 이름"
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            </label>
            {JSON.stringify(filters) !== JSON.stringify(START) ? (
              <button type="button" className="tc-ul" onClick={() => setFilters(START)}>
                처음대로
              </button>
            ) : null}
          </div>

          <div className="tc-table-wrap">
            <table className="tc-table ad-list">
              <thead>
                <tr>
                  <th scope="col">글자</th>
                  <th scope="col">묶음</th>
                  <th scope="col">목소리</th>
                  <th scope="col" className="num">
                    길이
                  </th>
                  <th scope="col">낭독 지시</th>
                  <th scope="col">만든 때</th>
                  <th scope="col">
                    <span className="visually-hidden">듣기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((row) => (
                  <tr key={row.key} className={row.cell ? undefined : "is-missing"}>
                    <th scope="row">
                      {row.text}
                      {row.cell ? <small className="ad-id">{row.cell.id}</small> : null}
                    </th>
                    <td>{row.kind === "audition" || row.kind === "other" ? KIND_LABEL[row.kind] : groupLabel(row.group)}</td>
                    <td>{row.cell?.voice || row.columnLabel}</td>
                    <td className="num">{row.cell ? seconds(row.cell.durationMs) : "-"}</td>
                    <td>{row.cell ? (row.cell.style === "flat" ? "평평 낭독" : row.cell.style === "plain" ? "지시 없음" : "-") : "-"}</td>
                    <td>{row.cell ? stamp(row.cell.generatedAt) : <span className="ad-missing">아직 없음</span>}</td>
                    <td className="tc-more">
                      {row.cell?.ref ? (
                        <button
                          type="button"
                          className="ad-play"
                          disabled={busy}
                          onClick={() => void practice.playRole(row.cell?.ref ?? null, "voice", row.text)}
                          aria-label={`${row.text} ${row.cell.voice} 듣기`}
                        >
                          {practice.playing === "voice" ? "…" : "듣기"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > limit ? (
            <button type="button" className="tc-ul" onClick={() => setLimit(limit + PAGE)}>
              {Math.min(PAGE, shown.length - limit)}개 더 보기
            </button>
          ) : null}
        </Section>
      </div>

      <Section num="05" title="빠진 음원 만들기" note="이 화면은 생성을 부르지 않아요">
        <p className="tc-label">
          apps/learn 폴더에서 실행해요. 키는 환경 변수로만 넣고(README 참고), 이미 만든 파일은 건너뛰어요.
        </p>
        <ul className="ad-commands">
          {view.commands.map((row) => (
            <li key={row.command}>
              <span>{row.label}</span>
              <code>{row.command}</code>
              <button type="button" className="tc-ul" onClick={() => void copy(row.command)}>
                {copied === row.command ? "복사했어요" : "복사"}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
