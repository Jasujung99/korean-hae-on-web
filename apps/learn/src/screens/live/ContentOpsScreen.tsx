// 콘텐츠 운영 화면(/teach/content).
// 1단계에서는 저장소 JSON과 현재 음원 목록을 읽기 전용으로 보여 주고 미리듣기를 연결한다.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CONTENT_VOICES } from "../../../content/practice-voices.ts";
import type {
  ContentAudioCell,
  ContentItemView,
  ContentStageSection,
  ContentStageZeroRow,
  TeacherContentView,
} from "../../../server/preview/contract.ts";
import { teacherApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";

const CONTEXT_LABEL: Record<string, string> = {
  medial_vcv: "모음 사이",
  initial_high: "어두 ㅣ·ㅜ",
  initial_nonhigh: "어두 ㅏ·ㅓ·ㅗ",
};

const STATE_LABEL: Record<ContentAudioCell["state"], string> = {
  approved: "승인",
  draft: "초안",
  stale: "다시 만들어야 함",
  missing: "없음",
};

function PlayIcon() {
  return (
    <svg className="co-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 2.2v7.6L10 6 3 2.2Z" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg className="co-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function AudioCellButton({
  voiceShort,
  voiceName,
  kindLabel,
  cell,
  busy,
  readOnly,
  onPlay,
}: {
  voiceShort: string;
  voiceName: string;
  kindLabel: string;
  cell: ContentAudioCell;
  busy: boolean;
  readOnly: boolean;
  onPlay: (url: string, label: string) => void;
}) {
  const playable = cell.state !== "missing" && Boolean(cell.playUrl);
  const stateText = STATE_LABEL[cell.state];
  const actionText = playable ? "재생" : readOnly ? "생성 준비 안 됨" : "생성";
  const label = `${voiceName} ${kindLabel} 음원, ${stateText}, ${actionText}`;

  return (
    <button
      type="button"
      className={`co-cell is-${cell.state}`}
      aria-label={label}
      title={cell.state === "stale" ? "글자가 바뀌어 다시 만들어야 해요" : `${voiceName} · ${stateText}`}
      disabled={busy || !playable}
      onClick={() => {
        if (cell.playUrl) onPlay(cell.playUrl, `${voiceName} ${kindLabel}`);
      }}
    >
      {playable ? <PlayIcon /> : <GenerateIcon />}
      <span>{voiceShort}</span>
      {cell.state === "stale" ? (
        <span className="co-stale-mark" aria-hidden="true">
          !
        </span>
      ) : null}
    </button>
  );
}

function AudioVoiceRow({
  kindLabel,
  cells,
  busy,
  readOnly,
  onPlay,
}: {
  kindLabel: string;
  cells: Record<string, ContentAudioCell>;
  busy: boolean;
  readOnly: boolean;
  onPlay: (url: string, label: string) => void;
}) {
  return (
    <div className="co-voices" role="group" aria-label={`${kindLabel} 목소리별 음원`}>
      {CONTENT_VOICES.map((voice) => {
        const cell = cells[voice.key] ?? {
          state: "missing" as const,
          assetId: null,
          audioId: "",
          playUrl: null,
          durationMs: null,
          generatedAt: null,
          source: null,
        };
        return (
          <AudioCellButton
            key={voice.key}
            voiceShort={voice.short}
            voiceName={voice.voice}
            kindLabel={kindLabel}
            cell={cell}
            busy={busy}
            readOnly={readOnly}
            onPlay={onPlay}
          />
        );
      })}
    </div>
  );
}

function StageZeroTable({
  rows,
  busy,
  onPlay,
}: {
  rows: ContentStageZeroRow[];
  busy: boolean;
  onPlay: (url: string, label: string) => void;
}) {
  return (
    <section className="tc-section co-stage0" aria-labelledby="stage0-title">
      <h3 id="stage0-title">
        <span className="tc-num">00</span>
        <span>Stage 0 · 의사단어와 첫 듣기 칸</span>
        <small>읽기 전용 · {rows.length}개</small>
      </h3>
      <div className="tc-table-wrap">
        <table className="tc-table co-stage0-table">
          <caption className="visually-hidden">Stage 0 의사단어와 첫 듣기 칸 목록</caption>
          <thead>
            <tr>
              <th scope="col">소리</th>
              <th scope="col">구분</th>
              <th scope="col">자음</th>
              <th scope="col">보기 낱말</th>
              <th scope="col">음원 E · S · C</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.stimulus}</th>
                <td>
                  {row.kind === "pseudoword" ? "의사단어" : "첫 듣기"} · {CONTEXT_LABEL[row.context] ?? row.context}
                </td>
                <td>{row.consonant}</td>
                <td>{row.word ? row.word : <span className="tc-none">-</span>}</td>
                <td>
                  <AudioVoiceRow kindLabel={row.stimulus} cells={row.audio} busy={busy} readOnly onPlay={onPlay} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContentRow({
  item,
  busy,
  readOnly,
  onPlay,
}: {
  item: ContentItemView;
  busy: boolean;
  readOnly: boolean;
  onPlay: (url: string, label: string) => void;
}) {
  const hasTurns = item.turnsAudio && CONTENT_VOICES.some((voice) => item.turnsAudio?.[voice.key]?.ready);
  return (
    <tr>
      <th scope="row" data-label="단어">
        <div className="co-word-cell">
          <strong>{item.word}</strong>
          <span className="co-meta-line">
            <span>{item.consonant}</span>
            {item.pos ? <span>· {item.pos}</span> : null}
            {item.status === "draft" ? <span className="tc-pill">초안</span> : null}
          </span>
        </div>
      </th>
      <td data-label="뜻" className="co-gloss-cell">
        {item.gloss ? <p>{item.gloss}</p> : <p className="tc-none">뜻 없음</p>}
        {item.scene ? <small className="co-sub">{item.scene}</small> : null}
      </td>
      <td data-label="예문" className="co-example-cell">
        {item.example ? (
          <div className="co-example-wrap">
            <p>{item.example}</p>
            <div className="co-example-audio">
              <span className="co-sub">예문</span>
              {item.exampleAudio ? (
                <AudioVoiceRow
                  kindLabel={`${item.word} 예문`}
                  cells={item.exampleAudio}
                  busy={busy}
                  readOnly={readOnly}
                  onPlay={onPlay}
                />
              ) : null}
              <span className="co-turns-note">
                또박또박:{" "}
                {hasTurns
                  ? CONTENT_VOICES.filter((voice) => item.turnsAudio?.[voice.key]?.ready).map((voice) => {
                      const turns = item.turnsAudio?.[voice.key];
                      return turns?.playUrl ? (
                        <button
                          key={voice.key}
                          type="button"
                          className="co-turns-play"
                          disabled={busy}
                          aria-label={`${voice.voice} ${item.word} 예문 또박또박 재생`}
                          onClick={() => onPlay(turns.playUrl as string, `${voice.voice} 또박또박`)}
                        >
                          {voice.short}
                        </button>
                      ) : null;
                    })
                  : "PC에서 생성"}
              </span>
            </div>
          </div>
        ) : (
          <p className="tc-none">예문 없음</p>
        )}
      </td>
      <td data-label="음원 E · S · C" className="co-audio-col">
        <AudioVoiceRow
          kindLabel={`${item.word} 단어`}
          cells={item.wordAudio}
          busy={busy}
          readOnly={readOnly}
          onPlay={onPlay}
        />
      </td>
    </tr>
  );
}

function StageAccordion({
  stage,
  open,
  busy,
  readOnly,
  onToggle,
  onPlay,
}: {
  stage: ContentStageSection;
  open: boolean;
  busy: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onPlay: (url: string, label: string) => void;
}) {
  return (
    <section className="tc-section co-stage" aria-labelledby={`stage-btn-${stage.key}`}>
      <button
        id={`stage-btn-${stage.key}`}
        type="button"
        className="co-stage-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="co-stage-name">{stage.key}</span>{" "}
        <span className="co-stage-title">{stage.title}</span>{" "}
        <span className="co-stage-counts">
          {stage.totalCount}개 · 승인 {stage.approvedCount} · 초안 {stage.draftCount}
        </span>
      </button>
      {open ? (
        <div className="tc-table-wrap">
          <table className="tc-table co-table">
            <caption className="visually-hidden">
              {stage.key} {stage.title} 단어 목록
            </caption>
            <thead>
              <tr>
                <th scope="col">단어</th>
                <th scope="col">뜻</th>
                <th scope="col">예문</th>
                <th scope="col">음원 E · S · C</th>
              </tr>
            </thead>
            <tbody>
              {stage.items.map((item) => (
                <ContentRow key={item.id} item={item} busy={busy} readOnly={readOnly} onPlay={onPlay} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ContentSkeleton() {
  return (
    <div className="co-skeleton" aria-label="콘텐츠를 불러오고 있어요">
      <div className="co-skel-bar" />
      <table className="tc-table co-table">
        <thead>
          <tr>
            <th scope="col">단어</th>
            <th scope="col">뜻</th>
            <th scope="col">예문</th>
            <th scope="col">음원 E · S · C</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4].map((row) => (
            <tr key={row}>
              <td><span className="co-skel-line" /></td>
              <td><span className="co-skel-line" /></td>
              <td><span className="co-skel-line" /></td>
              <td><span className="co-skel-line" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContentOpsScreen() {
  const practice = usePractice();
  const [params, setParams] = useSearchParams();
  const group = params.get("group") || "j_ch_jj";
  const stageParam = params.get("stage");
  const [view, setView] = useState<TeacherContentView | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    teacherApi
      .content(group)
      .then(setView)
      .catch(() => setFailed(true));
  }, [group]);

  useEffect(() => {
    load();
  }, [load]);

  const firstStageKey = view?.stages[0]?.key ?? "";
  const expandedSet = (() => {
    if (!view) return new Set<string>();
    if (stageParam === "none") return new Set<string>();
    if (!stageParam) return firstStageKey ? new Set([firstStageKey]) : new Set<string>();
    const valid = new Set(view.stages.map((s) => s.key));
    const parsed = stageParam.split(",").filter((key) => valid.has(key));
    return parsed.length > 0 ? new Set(parsed) : firstStageKey ? new Set([firstStageKey]) : new Set<string>();
  })();

  const selectGroup = (nextGroup: string) => {
    setView(null);
    setParams({ group: nextGroup }, { replace: true });
  };

  const toggleStage = (stageKey: string) => {
    if (!view) return;
    const next = new Set(expandedSet);
    if (next.has(stageKey)) next.delete(stageKey);
    else next.add(stageKey);
    const ordered = view.stages.map((s) => s.key).filter((key) => next.has(key));
    setParams(
      {
        group,
        stage: ordered.length > 0 ? ordered.join(",") : "none",
      },
      { replace: true },
    );
  };

  const playUrl = (url: string, label: string) => {
    void practice.playRole(url, "voice", label);
  };

  const busy = practice.playing !== null;

  return (
    <div className="tc-page co-page">
      <ScreenTitle title="콘텐츠 운영" />
      <div className="tc-head">
        <div>
          <p className="tc-label">선생님 화면 · 단어·예문·음원</p>
          <h2 className="tc-title">콘텐츠 운영</h2>
        </div>
        {view && !view.writable ? <p className="tc-label">읽기 전용 미리보기</p> : null}
      </div>
      <div className="tc-rule" />

      {failed ? (
        <section className="panel stack" role="alert">
          <p>불러오지 못했어요.</p>
          <button type="button" onClick={load}>
            다시 시도
          </button>
        </section>
      ) : null}

      {!view && !failed ? <ContentSkeleton /> : null}

      {view ? (
        <>
          <div className="co-groups" role="group" aria-label="자음 묶음">
            {view.groups.map((row) => (
              <button
                key={row.id}
                type="button"
                className="co-group-chip"
                aria-pressed={row.id === view.group.id}
                onClick={() => selectGroup(row.id)}
              >
                <span>{row.label}</span>{" "}
                <strong>{row.count}</strong>
              </button>
            ))}
          </div>

          <StageZeroTable rows={view.stage0} busy={busy} onPlay={playUrl} />

          {view.stages.map((stage) => (
            <StageAccordion
              key={stage.key}
              stage={stage}
              open={expandedSet.has(stage.key)}
              busy={busy}
              readOnly={!view.writable}
              onToggle={() => toggleStage(stage.key)}
              onPlay={playUrl}
            />
          ))}

          <p className="co-legend" aria-label="음원 상태 범례">
            <span className="co-legend-item">
              <i className="co-swatch is-approved" /> 승인
            </span>
            <span className="co-legend-item">
              <i className="co-swatch is-draft" /> 초안·검수 대기
            </span>
            <span className="co-legend-item">
              <i className="co-swatch is-stale">!</i> 다시 만들어야 함
            </span>
            <span className="co-legend-item">
              <i className="co-swatch is-missing">+</i> 없음(누르면 생성)
            </span>
            <span className="co-legend-voices">E = Erinome · S = Sulafat · C = Charon</span>
          </p>
        </>
      ) : null}
    </div>
  );
}
