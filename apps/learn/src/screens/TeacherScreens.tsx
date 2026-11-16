import { useState } from "react";
import { Link } from "react-router";
import { ScreenTitle } from "../ui";

const tasks = [
  { value: "identify", label: "듣고 자음 고르기" },
  { value: "abx", label: "두 소리 비교" },
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

const consonants = ["ㅈ", "ㅊ", "ㅉ"] as const;

export function TeacherLockedScreen() {
  return (
    <section className="panel stack" aria-labelledby="teacher-lock-title">
      <ScreenTitle title="교사 관찰" />
      <p className="eyebrow">교사 관찰</p>
      <h2 id="teacher-lock-title">교사 인증 전</h2>
      <p className="muted">
        담당 학습자의 기록은 교사 인증과 배정 뒤에 열립니다. 이 단계에는 로그인과 기록이 없습니다.
      </p>
      <p className="notice" role="status">
        주소만으로 기록이 열리지는 않습니다. 인증은 이후 단계에서 서버가 확인합니다. 역할 전환 버튼은 권한이 아닙니다.
      </p>
      <Link className="button primary" to="/">
        처음 화면으로
      </Link>
    </section>
  );
}

export function TeacherLayout({ mode }: { mode: "list" | "detail" }) {
  const [task, setTask] = useState<(typeof tasks)[number]["value"]>("identify");
  const [position, setPosition] = useState<(typeof positions)[number]["value"]>("medial");
  const [vowel, setVowel] = useState<(typeof vowels)[number]["value"]>("any");
  const taskLabel = tasks.find((item) => item.value === task)?.label ?? tasks[0].label;
  const positionLabel = positions.find((item) => item.value === position)?.label ?? positions[0].label;
  const vowelLabel = vowels.find((item) => item.value === vowel)?.label ?? vowels[0].label;

  return (
    <div className={mode === "detail" ? "teacher-layout on-detail" : "teacher-layout"}>
      <ScreenTitle title={mode === "detail" ? "학습 기록 자리" : "학습자 목록"} />
      <aside className="learner-list" aria-label="학습자 목록">
        <p className="eyebrow">교사 관찰</p>
        <h2 className="list-title">이번 학습 기록</h2>
        <p className="small">배정된 학습자가 없습니다.</p>
        <Link className="person" to="/teach/detail">
          <strong>상세 자리</strong>
          <small>학습자 기록이 아닙니다. 좁은 화면에서 빈 상세를 봅니다.</small>
        </Link>
      </aside>
      <section className="teacher-detail" aria-labelledby="teacher-detail-title">
        <Link className="text-link teacher-back" to="/teach">
          ← 학습자 목록
        </Link>
        <div className="row">
          <div>
            <p className="eyebrow">교사 관찰 · 빈 기록</p>
            <h2 id="teacher-detail-title">학습 기록 자리</h2>
          </div>
          <p className="small">기간을 집계하지 않습니다</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="small">활동 시간</span>
            <strong>없음</strong>
          </div>
          <div className="stat">
            <span className="small">학습한 날</span>
            <strong>없음</strong>
          </div>
          <div className="stat">
            <span className="small">최근 학습</span>
            <strong>없음</strong>
          </div>
        </div>
        <div className="filters">
          <label>
            활동
            <select value={task} onChange={(event) => setTask(event.target.value as typeof task)}>
              {tasks.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            소리 위치
            <select value={position} onChange={(event) => setPosition(event.target.value as typeof position)}>
              {positions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            모음 맥락
            <select value={vowel} onChange={(event) => setVowel(event.target.value as typeof vowel)}>
              {vowels.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="t-grid">
          <section className="panel stack">
            <div>
              <h3>소리별 첫 응답</h3>
              <p className="small">
                {taskLabel} · {positionLabel}
              </p>
            </div>
            {task === "identify" ? (
              <table aria-label="소리 혼동 자리">
                <caption>
                  {taskLabel} · {positionLabel} · {vowelLabel}. 기록이 없습니다.
                </caption>
                <thead>
                  <tr>
                    <th>제시 / 선택</th>
                    {consonants.map((consonant) => (
                      <th key={consonant}>{consonant}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consonants.map((presented) => (
                    <tr key={presented}>
                      <th scope="row">{presented}</th>
                      {consonants.map((chosen) => (
                        <td key={chosen}>없음</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="notice">두 소리 비교는 자음 식별과 합산하지 않습니다. 기록이 없습니다.</p>
            )}
          </section>
          <section className="panel stack">
            <h3>시간 구분</h3>
            <dl className="time-parts">
              <div>
                <dt>활동 시간</dt>
                <dd>기록 없음. 화면이 보이고 조작이 있거나 음원이 재생된 구간입니다.</dd>
              </div>
              <div>
                <dt>전체 경과</dt>
                <dd>기록 없음. 문항이나 회기가 실제로 흐른 시간입니다.</dd>
              </div>
              <div>
                <dt>음원 재생</dt>
                <dd>기록 없음. 실제로 재생된 구간의 합이며, 활동 시간과 겹칠 수 있습니다.</dd>
              </div>
              <div>
                <dt>화면 이탈·무응답</dt>
                <dd>기록 없음. 숨김과 긴 무응답이며, 총시간에서 두 번 빼지 않습니다.</dd>
              </div>
            </dl>
            <p className="small">서로 겹칠 수 있어 더해서 총시간으로 보이지 않습니다. 긴 체류를 집중이나 어려움으로 판정하지 않습니다.</p>
          </section>
        </div>
      </section>
    </div>
  );
}
