// 교사 관찰 화면. 짜임은 디자인 캔버스 시안(학습 관찰 목록·상세)을 따른다.
// 목록: 요약 수치 → 학습자 표 → 수치 읽는 법. 상세: 요약 → 살펴볼 점 → 번호 붙은 구획.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import type { LearnerDetail, LearnerSummary, Matrix, Tally } from "../../../server/preview/contract.ts";
import { teacherApi } from "../../preview/api";
import { ScreenTitle } from "../../ui";
import { formatDay, formatDuration } from "./format";

const vowels = [
  { value: "any", label: "전체" },
  { value: "i-u", label: "ㅣ·ㅜ 앞뒤" },
  { value: "a-eo-o", label: "ㅏ·ㅓ·ㅗ 앞뒤" },
] as const;
type VowelFilter = (typeof vowels)[number]["value"];

const FEW_ITEMS = 10;
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const TIER_BANDS = {
  tier12: { label: "Tier 1·2 완전·어미 최소대립", note: "주변 소리가 같을 때 소리 자체를 가려 듣는지" },
  tier34: { label: "Tier 3·4 받침·한 자모 차이", note: "주변 음절이 달라져도 가려 듣는지" },
  unpaired: { label: "짝 없음", note: "의사단어와 대립쌍 밖 낱말" },
} as const;
const LEVEL_NAMES = ["학습 없음", "1~5분", "6~10분", "10분 넘음"];

function Blade() {
  return (
    <svg className="tc-blade" viewBox="0 0 40 10" aria-hidden="true">
      <path d="M0 10C12 3 28 0 40 0C30 6 14 11 0 10Z" />
    </svg>
  );
}

/** 맞힌 수/들려준 수. 문항이 적으면 비율을 숨긴다. */
function Score({ tally }: { tally: Tally }) {
  if (tally.total === 0) return <span className="tc-none">기록 없음</span>;
  return (
    <>
      {tally.correct}/{tally.total}{" "}
      <span className="tc-none">
        {tally.total < FEW_ITEMS ? "문항 적음" : `${Math.round((tally.correct / tally.total) * 100)}%`}
      </span>
    </>
  );
}

function lastSeen(learner: LearnerSummary): string {
  if (learner.kind === "example") return "예시";
  return formatDay(learner.lastActive);
}

function BigStat({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
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

function Section({ num, title, note, children }: { num: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="tc-section">
      <h3>
        <span className="tc-num">{num}</span>
        <span>{title}</span>
        {note ? <small>{note}</small> : null}
      </h3>
      {children}
    </section>
  );
}

function worstCell(matrix: Matrix): { presented: number; chosen: number } | null {
  let best: { presented: number; chosen: number } | null = null;
  let top = 0;
  matrix.rows.forEach((row, presented) =>
    row.forEach((count, chosen) => {
      if (presented !== chosen && count > top) {
        top = count;
        best = { presented, chosen };
      }
    }),
  );
  return best;
}

function MatrixTable({ matrix, caption, title }: { matrix: Matrix; caption: string; title: string }) {
  const ring = worstCell(matrix);
  return (
    <div className="tc-matrix">
      <p className="tc-matrix-head">
        <span>{title}</span>
        <strong>
          {matrix.correct} / {matrix.total}
        </strong>
      </p>
      {matrix.total > 0 ? (
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">들려준 소리 / 고른 소리</span>
              </th>
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
                {row.map((count, chosen) => {
                  const marked = ring !== null && ring.presented === presented && ring.chosen === chosen;
                  return (
                    <td key={matrix.consonants[chosen]} className={presented === chosen ? "hit" : marked ? "ring" : undefined}>
                      {count}
                      {marked ? (
                        <svg viewBox="0 0 56 44" aria-hidden="true">
                          <path d="M30 5C14 3 4 12 5 23C6 35 18 41 31 39C44 37 52 29 50 18C48 8 38 2 23 6" />
                        </svg>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="tc-empty">아직 기록이 없어요.</p>
      )}
    </div>
  );
}

function dotLevel(ms: number): number {
  if (ms <= 0) return 0;
  if (ms <= 5 * 60_000) return 1;
  if (ms <= 10 * 60_000) return 2;
  return 3;
}

function Calendar({ days }: { days: LearnerDetail["calendar"] }) {
  const studied = days.filter((day) => day.activeMs > 0).length;
  return (
    <div className="tc-cal-wrap">
      <div className="tc-cal" role="img" aria-label={`날마다 학습한 시간을 점 크기로 나타낸 4주 달력. ${studied}일 학습했어요.`}>
        {WEEKDAYS.map((name) => (
          <span key={name} className="tc-cal-head" aria-hidden="true">
            {name}
          </span>
        ))}
        {days.map((day) => {
          const level = dotLevel(day.activeMs);
          const [, month, date] = day.date.split("-");
          return (
            <span key={day.date} title={`${Number(month)}월 ${Number(date)}일 · ${day.future ? "아직 오지 않은 날" : LEVEL_NAMES[level]}`}>
              {day.future ? null : <i className={`lv${level}`} />}
            </span>
          );
        })}
      </div>
      <ul className="tc-legend" aria-label="점 크기 읽는 법">
        {LEVEL_NAMES.map((name, level) => (
          <li key={name}>
            <span>
              <i className={`lv${level}`} />
            </span>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trend({ rows }: { rows: LearnerDetail["trend"] }) {
  if (rows.length === 0) return <p className="tc-empty">아직 마친 문항이 없어요.</p>;
  return (
    <div className="tc-trend" role="img" aria-label={rows.map((row) => `${row.label} ${row.correct}/${row.total}`).join(", ")}>
      <span className="tc-trend-axis top">100%</span>
      <span className="tc-trend-axis mid">50%</span>
      <div className="tc-bars">
        {rows.map((row, index) => {
          const percent = Math.round((row.correct / row.total) * 100);
          return (
            <div key={`${row.label}-${index}`}>
              <span>{index === rows.length - 1 ? `${percent}%` : ""}</span>
              <i style={{ height: `${Math.max(2, percent * 1.2)}px` }} />
            </div>
          );
        })}
      </div>
      <div className="tc-bar-labels">
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`}>
            <p>
              {row.correct}/{row.total}
            </p>
            <small>{row.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListView({ learners }: { learners: LearnerSummary[] }) {
  const studied = learners.filter((learner) => learner.days > 0).length;
  const resting = learners.filter(
    (learner) => learner.lastActive !== null && Date.now() - Date.parse(learner.lastActive) > 7 * 86_400_000,
  ).length;
  const errors = learners.reduce((sum, learner) => sum + learner.audioErrors, 0);

  return (
    <>
      <div className="tc-head">
        <div>
          <p className="tc-label">선생님 화면 · 읽기 전용</p>
          <h2 className="tc-title">학습 관찰</h2>
        </div>
        <p className="tc-label">담당 학습자의 기록만 보여요</p>
      </div>
      <div className="tc-rule" />
      <div className="tc-stats three">
        <BigStat label="학습한 학습자" value={studied} unit={`/ ${learners.length}명`} />
        <BigStat label="7일 넘게 쉰 학습자" value={resting} unit="명" />
        <BigStat label="음원 오류" value={errors} unit="건 · 오답으로 세지 않아요" />
      </div>

      <div className="tc-table-wrap">
        <table className="tc-table tc-people">
          <caption className="visually-hidden">학습자 {learners.length}명의 기록</caption>
          <thead>
            <tr>
              <th scope="col">학습자</th>
              <th scope="col">모어 / 일상에서 쓰는 말</th>
              <th scope="col">마지막 학습</th>
              <th scope="col" className="num">
                학습한 날
              </th>
              <th scope="col" className="num">
                활동 시간
              </th>
              <th scope="col" className="num">
                소리 · 모음 사이
              </th>
              <th scope="col" className="num">
                소리 · 첫머리
              </th>
              <th scope="col">살펴볼 점</th>
              <th scope="col">
                <span className="visually-hidden">자세히 보기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {learners.map((learner) => (
              <tr key={learner.id}>
                <th scope="row">
                  {learner.name}
                  {learner.kind === "example" ? <span className="tc-pill">예시</span> : null}
                </th>
                <td data-label="모어 / 일상에서 쓰는 말">{learner.languages}</td>
                <td data-label="마지막 학습">{lastSeen(learner)}</td>
                <td data-label="학습한 날" className="num">
                  {learner.days}일
                </td>
                <td data-label="활동 시간" className="num">
                  {formatDuration(learner.activeMs)}
                </td>
                <td data-label="소리 · 모음 사이" className="num">
                  <Score tally={learner.medial} />
                </td>
                <td data-label="소리 · 첫머리" className="num">
                  <Score tally={learner.initial} />
                </td>
                <td data-label="살펴볼 점" className="tc-note">
                  {learner.note}
                </td>
                <td className="tc-more">
                  <Link
                    className="tc-ul"
                    to={`/teach/detail?learner=${encodeURIComponent(learner.id)}`}
                    aria-label={`${learner.name} 자세히`}
                  >
                    자세히
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tc-defs">
        <p>
          <b>활동 시간</b> — 화면이 보이고 조작이 이어진 구간만 더해요. 집중했는지는 알 수 없어요.
        </p>
        <p>
          <b>소리 성적</b> — 피드백 전 첫 선택만 세요. 음원 오류 문항은 빼고, 맞힌 수/들려준 수로 적어요.
        </p>
        <p>
          <b>문항 적음</b> — 들려준 문항이 {FEW_ITEMS}개보다 적으면 비율을 숨기고 수만 보여 줘요.
        </p>
      </div>
    </>
  );
}

function DetailView({ detail }: { detail: LearnerDetail }) {
  const [vowel, setVowel] = useState<VowelFilter>("any");
  const medial = vowel === "any" ? detail.identify.medial : (detail.identify.byVowel[vowel] ?? detail.identify.medial);
  const vowelLabel = vowels.find((row) => row.value === vowel)?.label ?? "";
  const { stats } = detail;

  return (
    <>
      <Link className="tc-ul tc-back" to="/teach">
        학습자 목록으로
      </Link>
      <div className="tc-head">
        <h2 className="tc-title" id="teacher-detail-title">
          {detail.learner.name}
        </h2>
        <p className="tc-label">
          {detail.isExample ? <span className="tc-pill">예시</span> : null}
          {detail.isExample ? "예시 수치, 실제 학습 기록이 아니에요" : "학습 기록 · 음원은 검수 전 초안"}
        </p>
      </div>
      <div className="tc-rule" />
      <p className="tc-meta">
        <span>{detail.learner.languages}</span>
        <i>/</i>
        <span>마지막 학습 {lastSeen(detail.learner)}</span>
        <i>/</i>
        <span>{detail.period}</span>
      </p>

      <div className="tc-stats four">
        <BigStat label="학습한 날" value={stats.days} unit="일" />
        <BigStat label="활동 시간" value={formatDuration(stats.activeMs)} unit="조작이 이어진 시간" />
        <BigStat label="화면을 연 시간" value={formatDuration(stats.openMs)} unit="처음부터 마지막 기록까지" />
        <BigStat label="연습" value={stats.started} unit={`번 시작 · ${stats.finished}번 마침`} />
      </div>

      <aside className="tc-insight">
        <h3>살펴볼 점</h3>
        <p>{detail.insight}</p>
      </aside>

      <Section num="01" title="언제 학습했나" note="최근 4주 · 점이 클수록 오래 했어요">
        <Calendar days={detail.calendar} />
      </Section>

      <Section num="02" title="자주 헷갈린 소리" note="첫 응답만 · 음원 오류 문항 뺌 · 칸의 수는 응답 횟수">
        <div className="tc-toggle" role="group" aria-label="모음 맥락">
          {vowels.map((row) => (
            <button key={row.value} type="button" aria-pressed={vowel === row.value} onClick={() => setVowel(row.value)}>
              <span>{row.label}</span>
              {vowel === row.value ? <Blade /> : <span className="tc-blade-gap" />}
            </button>
          ))}
        </div>
        <p className="tc-label">세로는 들려준 소리, 가로는 고른 소리예요. 동그라미는 가장 잦은 혼동이에요.</p>
        <div className="tc-matrices">
          <MatrixTable matrix={medial} title="모음 사이" caption={`듣고 세 소리 고르기 · 모음 사이 · ${vowelLabel}`} />
          <MatrixTable matrix={detail.identify.initial} title="단어 첫머리" caption="듣고 세 소리 고르기 · 단어 첫머리" />
        </div>
        {medial.excluded > 0 ? (
          <p className="tc-label">재생 오류·재생 중 응답 {medial.excluded}개는 정오답에서 뺐어요.</p>
        ) : null}
        <table className="tc-table tc-tiers">
          <caption className="visually-hidden">대립 정밀도별 첫 응답</caption>
          <thead>
            <tr>
              <th scope="col">대립 정밀도</th>
              <th scope="col">무엇을 보나</th>
              <th scope="col" className="num">
                맞힘/들려줌
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.tiers.map((row) => (
              <tr key={row.band}>
                <th scope="row">{TIER_BANDS[row.band].label}</th>
                <td>{TIER_BANDS[row.band].note}</td>
                <td className="num">
                  <Score tally={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tc-label">
          두 소리 비교(ABX) {detail.abx.trials}번 가운데 {detail.abx.correct}번 같은 소리를 찾았어요
          {detail.abx.pairs.length > 0
            ? ` · ${detail.abx.pairs.map((pair) => `${pair.pair} ${pair.correct}/${pair.trials}`).join(", ")}`
            : ""}
          . 위 표와 합산하지 않아요.
        </p>
      </Section>

      <Section
        num="03"
        title="시간에 따른 변화"
        note={detail.isExample ? "주마다 첫 응답 · 모음 사이" : "회기마다 첫 응답 · 모음 사이"}
      >
        <Trend rows={detail.trend} />
        <p className="tc-label">막대 높이는 맞힌 비율, 아래 수는 맞힌 수/들려준 수예요.</p>
      </Section>

      <Section num="04" title="자주 틀린 문항">
        {detail.hardItems.length > 0 ? (
          <table className="tc-table">
            <thead>
              <tr>
                <th scope="col">문항</th>
                <th scope="col" className="num">
                  틀림/들려줌
                </th>
                <th scope="col">주로 고른 답</th>
              </tr>
            </thead>
            <tbody>
              {detail.hardItems.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="num">
                    {row.wrong}/{row.total}
                  </td>
                  <td>{row.chosen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="tc-empty">틀린 문항이 아직 없어요.</p>
        )}
      </Section>

      <Section num="05" title="답하기 전에 다시 들은 횟수">
        <table className="tc-table">
          <thead>
            <tr>
              <th scope="col">들려준 소리</th>
              <th scope="col" className="num">
                평균 다시 듣기
              </th>
              <th scope="col" className="num">
                가장 많이
              </th>
              <th scope="col" className="num">
                문항
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.replays.map((row) => (
              <tr key={row.consonant}>
                <th scope="row">모음 사이 {row.consonant}</th>
                <td className="num">{row.items ? `${row.average}번` : "-"}</td>
                <td className="num">{row.items ? `${row.max}번` : "-"}</td>
                <td className="num">{row.items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section num="06" title="오래 머문 문항과 멈춘 곳" note={detail.recent ? `최근 회기 · ${detail.recent.label}` : undefined}>
        <p className="tc-label">
          머문 시간은 집중했거나 어려웠다는 뜻이 아니에요. 화면을 떠난 시간과 조작 없이 지난 시간은 따로 적었어요.
        </p>
        {detail.recent && detail.recent.dwell.length > 0 ? (
          <div className="tc-table-wrap">
            <table className="tc-table">
              <thead>
                <tr>
                  <th scope="col">문항</th>
                  <th scope="col">첫 응답</th>
                  <th scope="col" className="num">
                    머문 시간
                  </th>
                  <th scope="col" className="num">
                    다시 듣기
                  </th>
                  <th scope="col" className="num">
                    첫 응답까지
                  </th>
                  <th scope="col" className="num">
                    화면 떠남
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.recent.dwell.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>{row.outcome}</td>
                    <td className="num">{formatDuration(row.dwellMs)}</td>
                    <td className="num">{row.replays}번</td>
                    <td className="num">{row.waitMs === null ? "-" : formatDuration(row.waitMs)}</td>
                    <td className="num">{row.hiddenMs > 0 ? formatDuration(row.hiddenMs) : "없음"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tc-empty">아직 응답이 없어요.</p>
        )}
        {detail.recent ? (
          <p className="tc-label">
            최근 회기 활동 {formatDuration(detail.recent.activeMs)} · 음원 재생 {formatDuration(detail.recent.audioMs)} · 화면 이탈{" "}
            {formatDuration(detail.recent.hiddenMs)} · 조작 없이 지남 {formatDuration(detail.recent.idleMs)}
          </p>
        ) : null}
        {detail.stops.length > 0 ? (
          <ul className="tc-stops">
            {detail.stops.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="tc-empty">중간에 멈춘 기록이 없어요.</p>
        )}
      </Section>

      <div className="tc-defs">
        <p>
          <b>활동 시간</b> — 화면이 보이고 조작이나 재생이 이어진 구간이에요. 30초 넘게 조작이 없으면 멈춰요.
        </p>
        <p>
          <b>화면을 연 시간</b> — 한 번 접속한 동안 처음부터 마지막 기록까지예요.
        </p>
        <p>
          <b>화면 이탈·무응답</b> — 화면을 숨긴 시간과 30초 넘게 조작이 없던 시간이에요. 총시간에서 두 번 빼지 않아요.
        </p>
      </div>
    </>
  );
}

/** 학습자 한 명의 관찰 상세. 목록은 TeacherHome이 보여 준다. */
export function TeacherDetail() {
  const [params] = useSearchParams();
  const selected = params.get("learner") ?? "";
  const [detail, setDetail] = useState<LearnerDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setDetail(null);
    teacherApi
      .learner(selected)
      .then(({ detail: next }) => setDetail(next))
      .catch(() => setFailed(true));
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="tc-page">
      <ScreenTitle title={detail ? `${detail.learner.name} 학습 기록` : "학습 관찰"} />
      {failed ? (
        <p className="notice" role="status">
          기록을 불러오지 못했어요. 담당 학습자인지, 로그인이 이어지는지 확인해 주세요.{" "}
          <Link className="tc-ul" to="/teach">
            학습자 목록으로
          </Link>
        </p>
      ) : null}
      {!detail && !failed ? <p className="tc-label">기록을 불러오고 있어요…</p> : null}
      {detail ? <DetailView detail={detail} /> : null}
    </div>
  );
}
