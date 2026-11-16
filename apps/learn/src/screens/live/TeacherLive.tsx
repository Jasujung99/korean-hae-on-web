import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { LearnerDetail, LearnerSummary, Matrix } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { ScreenTitle } from "../../ui";
import { formatDay, formatDuration } from "./format";

const tasks = [
  { value: "identify", label: "듣고 세 소리 고르기" },
  { value: "abx", label: "두 소리 비교 · ABX" },
] as const;

const positions = [
  { value: "medial", label: "모음 사이" },
  { value: "initial", label: "단어 첫머리" },
] as const;

const vowels = [
  { value: "any", label: "모음 맥락 전체" },
  { value: "i-u", label: "ㅣ·ㅜ 맥락" },
  { value: "a-eo-o", label: "ㅏ·ㅓ·ㅗ 맥락" },
] as const;

const DEFAULT_LEARNER = "preview-learner";

function MatrixTable({ matrix, caption }: { matrix: Matrix; caption: string }) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">제시 / 선택</th>
          {matrix.consonants.map((consonant) => (
            <th key={consonant} scope="col">
              {consonant}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.rows.map((row, presented) => (
          <tr key={matrix.consonants[presented]}>
            <th scope="row">{matrix.consonants[presented]}</th>
            {row.map((count, chosen) => (
              <td key={matrix.consonants[chosen]} className={presented === chosen ? "hit" : undefined}>
                {count}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeacherLive({ mode }: { mode: "list" | "detail" }) {
  const [params] = useSearchParams();
  const selected = params.get("learner") ?? DEFAULT_LEARNER;
  const [learners, setLearners] = useState<LearnerSummary[] | null>(null);
  const [detail, setDetail] = useState<LearnerDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [task, setTask] = useState<(typeof tasks)[number]["value"]>("identify");
  const [position, setPosition] = useState<(typeof positions)[number]["value"]>("medial");
  const [vowel, setVowel] = useState<(typeof vowels)[number]["value"]>("any");
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    previewApi
      .learners()
      .then(({ learners: list }) => setLearners(list))
      .catch(() => setFailed(true));
    previewApi
      .learner(selected)
      .then(({ detail: next }) => setDetail(next))
      .catch(() => setFailed(true));
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = async () => {
    if (!window.confirm("이 컴퓨터의 미리보기 학습 기록을 모두 지울까요? 예시 학습자는 그대로 남아요.")) return;
    setResetting(true);
    try {
      await previewApi.reset();
      load();
    } finally {
      setResetting(false);
    }
  };

  const matrix: Matrix | null = detail
    ? position === "initial"
      ? detail.identify.initial
      : vowel === "any"
        ? detail.identify.medial
        : (detail.identify.byVowel[vowel] ?? detail.identify.medial)
    : null;
  const taskLabel = tasks.find((row) => row.value === task)?.label ?? "";
  const positionLabel = positions.find((row) => row.value === position)?.label ?? "";
  const vowelLabel = vowels.find((row) => row.value === vowel)?.label ?? "";

  return (
    <div className={mode === "detail" ? "teacher-layout on-detail" : "teacher-layout"}>
      <ScreenTitle title={mode === "detail" && detail ? `${detail.learner.name} 학습 기록` : "학습자 목록"} />
      <aside className="learner-list" aria-label="학습자 목록">
        <p className="eyebrow">교사 관찰</p>
        <h2 className="list-title">이번 학습 기록</h2>
        <p className="small">{learners ? `${learners.length}명 · 미리보기` : "불러오는 중"}</p>
        {learners?.map((learner) => (
          <Link
            key={learner.id}
            className="person"
            to={`/teach/detail?learner=${encodeURIComponent(learner.id)}`}
            aria-current={learner.id === selected ? "true" : undefined}
          >
            <strong>
              {learner.name} {learner.kind === "example" ? <span className="pill future">예시</span> : null}
            </strong>
            <small>
              {learner.languages} · {learner.days}일 참여
              <br />
              {learner.note}
            </small>
          </Link>
        ))}
      </aside>
      <section className="teacher-detail" aria-labelledby="teacher-detail-title">
        <Link className="text-link teacher-back" to="/teach">
          ← 학습자 목록
        </Link>
        {failed ? (
          <p className="notice" role="status">
            기록을 불러오지 못했어요. 미리보기 서버가 켜져 있는지 확인해 주세요.
          </p>
        ) : null}
        {!detail && !failed ? <p className="muted">기록을 불러오고 있어요…</p> : null}
        {detail ? (
          <>
            <div className="row">
              <div>
                <p className="eyebrow">교사 관찰 · 학습 기록</p>
                <h2 id="teacher-detail-title">
                  {detail.learner.name}
                  {detail.isExample ? <span className="pill future title-pill">예시 · 실제 기록 아님</span> : null}
                </h2>
              </div>
              <p className="small">{detail.period}</p>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="small">활동 시간</span>
                <strong>{formatDuration(detail.stats.activeMs)}</strong>
              </div>
              <div className="stat">
                <span className="small">학습한 날</span>
                <strong>{detail.stats.days}일</strong>
              </div>
              <div className="stat">
                <span className="small">최근 학습</span>
                <strong>{detail.isExample ? "11/15" : formatDay(detail.stats.lastActive)}</strong>
              </div>
            </div>
            <div className="filters">
              <label>
                활동
                <select value={task} onChange={(event) => setTask(event.target.value as typeof task)}>
                  {tasks.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                소리 위치
                <select value={position} onChange={(event) => setPosition(event.target.value as typeof position)}>
                  {positions.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                모음 맥락
                <select
                  value={vowel}
                  disabled={position !== "medial"}
                  onChange={(event) => setVowel(event.target.value as typeof vowel)}
                >
                  {vowels.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="t-grid">
              <section className="panel stack">
                <div>
                  <h3>소리별 첫 응답</h3>
                  <p className="small">첫 제출 기준 · 재시도 제외</p>
                </div>
                {task === "identify" && matrix ? (
                  matrix.total > 0 ? (
                    <>
                      <p>
                        <strong className="big-num">
                          {matrix.correct} / {matrix.total}
                        </strong>{" "}
                        <span className="small">맞힘</span>
                      </p>
                      <p className="small">행: 들려준 소리 / 열: 학습자 선택</p>
                      <MatrixTable matrix={matrix} caption={`${taskLabel} · ${positionLabel} · ${vowelLabel}`} />
                      <p className="small">
                        같은 과제·소리 위치·음원 판 기준이에요.
                        {matrix.excluded > 0 ? ` 재생 오류·재생 중 응답 ${matrix.excluded}개는 정오답에서 뺐어요.` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="notice">
                      {position === "initial"
                        ? "단어 첫머리 문항은 아직 출제하지 않았어요(Stage 3·4). 기록이 없어요."
                        : "이 조건의 기록이 아직 없어요. 학습자 화면에서 듣기 퀴즈를 풀어 보세요."}
                    </p>
                  )
                ) : (
                  <>
                    <p>
                      <strong className="big-num">
                        {detail.abx.correct} / {detail.abx.trials}
                      </strong>{" "}
                      <span className="small">같은 소리를 찾음</span>
                    </p>
                    {detail.abx.pairs.length > 0 ? (
                      <ul className="plain-list">
                        {detail.abx.pairs.map((pair) => (
                          <li key={pair.pair}>
                            {pair.pair} · {pair.trials}번 중 {pair.correct}번
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="notice">두 소리 비교 기록이 아직 없어요.</p>
                    )}
                    <p className="small">두 소리 비교는 자음 식별 점수와 합산하지 않아요.</p>
                  </>
                )}
                <div>
                  <h3>답하기 전에 다시 들은 횟수</h3>
                  <table>
                    <caption>들려준 소리별 평균과 가장 많이</caption>
                    <thead>
                      <tr>
                        <th scope="col">소리</th>
                        <th scope="col">평균</th>
                        <th scope="col">가장 많이</th>
                        <th scope="col">문항</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.replays.map((row) => (
                        <tr key={row.consonant}>
                          <th scope="row">{row.consonant}</th>
                          <td>{row.items ? `${row.average}번` : "-"}</td>
                          <td>{row.items ? `${row.max}번` : "-"}</td>
                          <td>{row.items}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <h3>최근 회기 살펴보기</h3>
                {detail.recent ? (
                  <>
                    <p className="small">{detail.recent.label}</p>
                    <div className="log-row">
                      <span>활동 시간</span>
                      <strong>{formatDuration(detail.recent.activeMs)}</strong>
                    </div>
                    <div className="log-row">
                      <span>음원 재생</span>
                      <strong>{formatDuration(detail.recent.audioMs)}</strong>
                    </div>
                    <div className="time-parts">
                      <p className="small">
                        화면을 연 전체 시간 {formatDuration(detail.recent.openMs)}
                        <br />
                        그중 화면 이탈 {formatDuration(detail.recent.hiddenMs)} · 조작 없이 지남{" "}
                        {formatDuration(detail.recent.idleMs)}
                        <br />
                        실제 음원 재생은 활동 시간과 겹칠 수 있어요
                      </p>
                    </div>
                    {detail.recent.dwell[0] ? (
                      <div className="log-row">
                        <span>가장 오래 머문 문항</span>
                        <strong>
                          {detail.recent.dwell[0].label} · {formatDuration(detail.recent.dwell[0].dwellMs)}
                        </strong>
                      </div>
                    ) : null}
                    <details>
                      <summary>문항별 응답·재청취</summary>
                      {detail.recent.dwell.length > 0 ? (
                        detail.recent.dwell.map((row) => (
                          <p key={row.label}>
                            {row.label}: {row.outcome}
                            <br />
                            <span className="small">
                              첫 제출 전 다시 듣기 {row.replays}번 · 응답 대기{" "}
                              {row.waitMs === null ? "-" : formatDuration(row.waitMs)} · 머문 시간{" "}
                              {formatDuration(row.dwellMs)} · 화면 이탈 {formatDuration(row.hiddenMs)}
                            </span>
                          </p>
                        ))
                      ) : (
                        <p className="small">아직 응답이 없어요.</p>
                      )}
                    </details>
                    <details>
                      <summary>중단·재개 기록</summary>
                      {detail.recent.interruptions.length > 0 ? (
                        detail.recent.interruptions.map((line) => (
                          <p key={line} className="small">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="small">이 회기에는 중단 기록이 없어요.</p>
                      )}
                    </details>
                    <p className="teacher-key">
                      문항·음원 판: 미리보기 초안 · 재생 오류 문항은 정오답에서 제외 · 회기 {detail.sessions}개
                    </p>
                  </>
                ) : (
                  <p className="notice">아직 회기 기록이 없어요.</p>
                )}
              </section>
            </div>
            <dl className="time-defs">
              <div>
                <dt>활동 시간</dt>
                <dd>화면이 보이고 조작이나 재생이 이어진 구간이에요. 30초 넘게 조작이 없으면 멈춰요.</dd>
              </div>
              <div>
                <dt>전체 경과</dt>
                <dd>한 번 접속한 동안 처음부터 마지막 기록까지의 시간이에요.</dd>
              </div>
              <div>
                <dt>음원 재생</dt>
                <dd>실제로 재생된 길이의 합이에요. 활동 시간과 겹칠 수 있어요.</dd>
              </div>
              <div>
                <dt>화면 이탈·무응답</dt>
                <dd>화면을 숨긴 시간과 30초 넘게 조작이 없던 시간이에요. 총시간에서 두 번 빼지 않아요.</dd>
              </div>
            </dl>
            <p className="flow-note">
              머문 시간은 관찰 자료예요. 집중도나 어려움으로 자동 판정하지 않아요. 역할 전환은 교사 인증이 아니에요.
            </p>
            {!detail.isExample ? (
              <button type="button" className="ghost-danger" onClick={() => void reset()} disabled={resetting}>
                미리보기 기록 지우기
              </button>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
