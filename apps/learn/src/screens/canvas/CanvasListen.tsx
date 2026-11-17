import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { ListenView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";
import { Blade, StripLink } from "./parts";
import { topConfusion } from "./summary";

const CARD_TONE = ["paper", "sage", "lavender"];

// 소리 익히기: 듣고 고르기를 먼저 푼 뒤에 온다. 점수를 매기지 않고, 글자를 보며 자유롭게 비교해 듣는다.
export function CanvasListen() {
  const practice = usePractice();
  const navigate = useNavigate();
  const [view, setView] = useState<ListenView | null>(null);
  const [frame, setFrame] = useState(0);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    practice.ensureSession();
  }, [practice]);

  useEffect(() => {
    previewApi
      .listen()
      .then(setView)
      .catch(() => setView({ frames: [] }));
  }, []);

  const confusion = topConfusion(Object.values(practice.results));
  const sounds = view?.frames[frame]?.sounds ?? [];

  return (
    <div className="c-page">
      <ScreenTitle title="소리 익히기" />
      <div className="c-top">
        <p className="c-label">
          <span className="c-num sm">02</span> 소리 익히기
        </p>
        <p className="c-count">점수를 매기지 않아요</p>
      </div>
      <h2 className="c-title">세 소리를 들어 보세요.</h2>
      <div className="c-rule" />
      <p className="c-body">
        {confusion
          ? `방금 ${confusion.from}을 ${confusion.to}으로 ${confusion.count}번 골랐어요. 두 카드를 번갈아 눌러 보세요.`
          : "카드를 누르면 소리가 나요. 여러 번 눌러 비교해 보세요."}
      </p>

      <div className="c-frames" role="group" aria-label="앞 모음 고르기">
        {(view?.frames ?? []).map((row, position) => (
          <button key={row.lead} type="button" aria-pressed={frame === position} onClick={() => setFrame(position)}>
            {row.lead}
            {frame === position ? <Blade /> : <span className="blade-gap" />}
          </button>
        ))}
      </div>

      <div className="c-cards">
        {sounds.map((sound, position) => {
          const marked = confusion ? sound.key === confusion.from || sound.key === confusion.to : false;
          return (
            <button
              key={sound.key}
              type="button"
              className={[`tone-${CARD_TONE[position]}`, marked ? "is-marked" : ""].filter(Boolean).join(" ")}
              aria-label={`${sound.text} 듣기`}
              disabled={practice.playing !== null || !sound.audioRef}
              onClick={() => {
                setLast(sound.text);
                void practice.playSound(sound.audioRef, sound.text, "listen");
              }}
            >
              <b className={`p${position + 1}`}>{sound.key}</b>
              <span>{sound.text}</span>
              {last === sound.text ? <Blade /> : <span className="blade-gap" />}
            </button>
          );
        })}
      </div>
      <p className="c-caption center" aria-live="polite">
        {last ? `지금 들은 소리 — ${last}` : "카드를 눌러 보세요."} ·{" "}
        고정 음원(검수 전 초안)
      </p>

      <StripLink onClick={() => navigate("/dictionary")}>새 단어 보기</StripLink>
      <p className="c-foot">
        <Link to="/finish">학습 리포트 보기</Link> · <Link to="/compare">두 소리 비교</Link>
      </p>
    </div>
  );
}
