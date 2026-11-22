// 콘텐츠 운영 화면(/teach/content).
// 단어·예문 추가·수정·숨기기·판 기록과 목소리별 음원 상태·미리듣기를 한 화면에서 다룬다.
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CONTENT_VOICES } from "../../../content/practice-voices.ts";
import type {
  ContentAudioCell,
  ContentItemView,
  ContentReleaseStatusView,
  ContentStageSection,
  ContentStageZeroRow,
  ContentVersionRow,
  DraftAudioReviewRow,
  TeacherContentView,
} from "../../../server/preview/contract.ts";
import { PreviewApiError, teacherApi } from "../../preview/api";
import { usePractice } from "../../preview/PracticeContext";
import { ScreenTitle } from "../../ui";
import { formatDay } from "./format";

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

const FIELD_LABEL: Record<string, string> = {
  created: "추가",
  word: "단어",
  consonant: "자음",
  stage: "단계",
  substage: "세부 단계",
  pos: "품사",
  gloss: "뜻",
  scene: "장면",
  example: "예문",
  related: "함께 쓰는 말",
  note: "메모",
  status: "상태",
};

type ConfirmGen = {
  itemId: string;
  word: string;
  kind: "word" | "sentence";
  /** 예문이면 몇 번 예문인지(1~5) */
  exampleIndex?: number;
  voiceKey: string;
  voiceName: string;
  stalePlayUrl: string | null;
  origin: "cell" | "draft";
  draftAssetId?: string;
};

function formatDurationSec(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "길이 미확인";
  return `${(ms / 1000).toFixed(1)}초`;
}

function formatRelativeTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "방금";
  const diffSec = Math.floor((Date.now() - parsed) / 1000);
  if (diffSec < 60) return "방금";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return formatDay(iso);
}

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
  ttsReady,
  isGenerating,
  onPlay,
  onRequestGenerate,
}: {
  voiceShort: string;
  voiceName: string;
  kindLabel: string;
  cell: ContentAudioCell;
  busy: boolean;
  readOnly: boolean;
  ttsReady: boolean;
  isGenerating: boolean;
  onPlay: (url: string, label: string) => void;
  onRequestGenerate?: () => void;
}) {
  const isMissing = cell.state === "missing";
  const isStale = cell.state === "stale";
  const canGenerate = !readOnly && ttsReady && (isMissing || isStale) && Boolean(onRequestGenerate);
  const playable = !isMissing && Boolean(cell.playUrl);
  const stateText = STATE_LABEL[cell.state];
  const actionText = isGenerating
    ? "만드는 중"
    : canGenerate
      ? isStale
        ? "다시 만들기"
        : "생성"
      : playable
        ? "재생"
        : "생성 준비 안 됨";
  const label = `${voiceName} ${kindLabel} 음원, ${stateText}, ${actionText}`;
  const disabled = isGenerating || (!canGenerate && (!playable || busy));

  return (
    <button
      type="button"
      className={`co-cell is-${cell.state}${isGenerating ? " is-generating" : ""}`}
      aria-label={label}
      title={
        isGenerating
          ? "만드는 중…"
          : isMissing && !readOnly && !ttsReady
            ? "생성 준비 안 됨"
            : isStale
              ? "글자가 바뀌어 다시 만들어야 해요"
              : `${voiceName} · ${stateText}`
      }
      disabled={disabled}
      onClick={() => {
        if (canGenerate) {
          onRequestGenerate?.();
        } else if (cell.playUrl) {
          onPlay(cell.playUrl, `${voiceName} ${kindLabel}`);
        }
      }}
    >
      {isGenerating ? (
        <span>만드는 중…</span>
      ) : (
        <>
          {playable ? <PlayIcon /> : <GenerateIcon />}
          <span>{voiceShort}</span>
          {isStale ? (
            <span className="co-stale-mark" aria-hidden="true">
              !
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

function AudioVoiceRow({
  kindLabel,
  cells,
  busy,
  readOnly,
  ttsReady = false,
  generatingVoice = null,
  onPlay,
  onRequestGenerate,
}: {
  kindLabel: string;
  cells: Record<string, ContentAudioCell>;
  busy: boolean;
  readOnly: boolean;
  ttsReady?: boolean;
  generatingVoice?: string | null;
  onPlay: (url: string, label: string) => void;
  onRequestGenerate?: (voiceKey: string, voiceName: string, cell: ContentAudioCell) => void;
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
            ttsReady={ttsReady}
            isGenerating={generatingVoice === voice.key}
            onPlay={onPlay}
            onRequestGenerate={
              onRequestGenerate ? () => onRequestGenerate(voice.key, voice.voice, cell) : undefined
            }
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

function InlineEditPanel({
  item,
  choices,
  focusField,
  onSaved,
  onCancel,
}: {
  item: ContentItemView;
  choices: readonly string[];
  focusField: "word" | "example";
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState(item.word);
  const [consonant, setConsonant] = useState(item.consonant);
  const [pos, setPos] = useState(item.pos);
  const [gloss, setGloss] = useState(item.gloss);
  const [scene, setScene] = useState(item.scene);
  const [example, setExample] = useState(item.example);
  // 예문 2~5번 입력칸(빈 칸은 저장할 때 빠진다)
  const [extras, setExtras] = useState<string[]>(() => {
    const list = (item.extraExamples ?? []).map((row) => row.text);
    return [...list, "", "", "", ""].slice(0, 4);
  });
  const [related, setRelated] = useState(item.related);
  const [note, setNote] = useState(item.note);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim()) {
      setError("단어를 비울 수 없어요.");
      return;
    }
    const extraList = extras.map((text) => text.trim()).filter(Boolean);
    if (extraList.length > 0 && !example.trim()) {
      setError("예문 1을 먼저 써 주세요.");
      return;
    }
    if (new Set([example.trim(), ...extraList]).size !== extraList.length + 1) {
      setError("같은 예문이 두 번 들어 있어요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teacherApi.updateContentItem(item.id, {
        word: word.trim(),
        consonant,
        pos: pos.trim(),
        gloss: gloss.trim(),
        scene: scene.trim(),
        example: example.trim(),
        extraExamples: extraList,
        related: related.trim(),
        note: note.trim(),
        reason: reason.trim(),
      });
      onSaved();
    } catch {
      setError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await teacherApi.approveContentItem(item.id);
      onSaved();
    } catch {
      setError("승인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const hide = async () => {
    if (!window.confirm(`'${item.word}' 단어를 목록에서 숨길까요? 기록과 음원은 지워지지 않아요.`)) return;
    setBusy(true);
    setError(null);
    try {
      await teacherApi.hideContentItem(item.id, reason.trim() || undefined);
      onSaved();
    } catch {
      setError("숨기지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="co-edit-row">
      <td colSpan={4}>
        <form className="co-edit-form" onSubmit={(event) => void submit(event)} noValidate aria-label={`${item.word} 편집`}>
          <div className="co-edit-grid">
            <label className="acct-field">
              <span>단어</span>
              <input
                value={word}
                autoFocus={focusField === "word"}
                onChange={(event) => setWord(event.target.value)}
              />
            </label>
            <label className="acct-field">
              <span>자음</span>
              <select value={consonant} onChange={(event) => setConsonant(event.target.value)}>
                {choices.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </label>
            <label className="acct-field">
              <span>품사</span>
              <input value={pos} onChange={(event) => setPos(event.target.value)} placeholder="명·동·형" />
            </label>
            <label className="acct-field co-span-2">
              <span>쉬운 뜻</span>
              <input value={gloss} onChange={(event) => setGloss(event.target.value)} />
            </label>
            <label className="acct-field">
              <span>장면</span>
              <input value={scene} onChange={(event) => setScene(event.target.value)} />
            </label>
            <label className="acct-field co-span-3">
              <span>예문 1 (대표, 직접 작성)</span>
              <textarea
                rows={2}
                value={example}
                autoFocus={focusField === "example"}
                onChange={(event) => setExample(event.target.value)}
              />
            </label>
            {extras.map((text, index) => (
              <label key={index} className="acct-field co-span-3">
                <span>예문 {index + 2}</span>
                <textarea
                  rows={1}
                  value={text}
                  onChange={(event) =>
                    setExtras((prev) => prev.map((value, i) => (i === index ? event.target.value : value)))
                  }
                />
              </label>
            ))}
            <label className="acct-field">
              <span>함께 쓰는 말</span>
              <input value={related} onChange={(event) => setRelated(event.target.value)} />
            </label>
            <label className="acct-field">
              <span>메모</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <label className="acct-field">
              <span>고친 이유 (선택)</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="예: 자연스러운 표현으로 다듬음" />
            </label>
          </div>
          {error ? (
            <p className="acct-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="co-edit-actions">
            <button type="submit" disabled={busy}>
              {busy ? "저장하는 중…" : "저장"}
            </button>
            <button type="button" disabled={busy} onClick={onCancel}>
              취소
            </button>
            {item.status === "draft" ? (
              <button type="button" className="tc-ul" disabled={busy} onClick={() => void approve()}>
                승인
              </button>
            ) : null}
            <button type="button" className="tc-ul" disabled={busy} onClick={() => void hide()}>
              숨기기
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function HistoryPanel({ item }: { item: ContentItemView }) {
  const [versions, setVersions] = useState<ContentVersionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    teacherApi
      .itemVersions(item.id)
      .then((res) => {
        if (active) setVersions(res.versions);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  return (
    <tr className="co-history-row">
      <td colSpan={4}>
        <div className="co-history-box" role="region" aria-label={`${item.word} 수정 기록`}>
          <p className="co-sub">수정 기록</p>
          {failed ? <p className="acct-error">기록을 불러오지 못했어요.</p> : null}
          {!versions && !failed ? <p className="co-sub">불러오는 중…</p> : null}
          {versions && versions.length === 0 ? <p className="co-sub">아직 기록이 없어요.</p> : null}
          {versions && versions.length > 0 ? (
            <ul className="co-history-list">
              {versions.map((ver) => (
                <li key={ver.version}>
                  <strong>v{ver.version}</strong> · {formatDay(ver.createdAt)} ·{" "}
                  {ver.changedFields.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
                  {ver.reason ? ` · ${ver.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function AddWordRow({
  groupId,
  stageKey,
  choices,
  existingWords,
  onAdded,
}: {
  groupId: string;
  stageKey: string;
  choices: readonly string[];
  existingWords: ReadonlySet<string>;
  onAdded: () => void;
}) {
  const [word, setWord] = useState("");
  const [consonant, setConsonant] = useState("");
  const [gloss, setGloss] = useState("");
  const [example, setExample] = useState("");
  const [wordErr, setWordErr] = useState<string | null>(null);
  const [consonantErr, setConsonantErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [confirmDup, setConfirmDup] = useState(false);
  const [busy, setBusy] = useState(false);

  const doCreate = async () => {
    setBusy(true);
    setSubmitErr(null);
    try {
      await teacherApi.createContentItem({
        groupId,
        stage: stageKey,
        consonant,
        word: word.trim(),
        gloss: gloss.trim(),
        example: example.trim(),
      });
      setWord("");
      setConsonant("");
      setGloss("");
      setExample("");
      setConfirmDup(false);
      onAdded();
    } catch {
      setSubmitErr("추가하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = word.trim();
    let bad = false;
    if (!trimmed) {
      setWordErr("새 단어를 써 주세요.");
      bad = true;
    } else {
      setWordErr(null);
    }
    if (!consonant) {
      setConsonantErr("자음을 골라 주세요.");
      bad = true;
    } else {
      setConsonantErr(null);
    }
    if (bad) return;

    if (existingWords.has(trimmed) && !confirmDup) {
      setConfirmDup(true);
      return;
    }
    void doCreate();
  };

  return (
    <form className="co-add-row" onSubmit={handleSubmit} noValidate aria-label={`${stageKey} 새 단어 추가`}>
      <div className="co-add-field">
        <input
          aria-label={`${stageKey} 새 단어`}
          placeholder="새 단어"
          value={word}
          onChange={(event) => {
            setWord(event.target.value);
            setWordErr(null);
            setConfirmDup(false);
          }}
        />
        {wordErr ? (
          <small className="acct-error" role="alert">
            {wordErr}
          </small>
        ) : null}
      </div>
      <div className="co-add-field">
        <select
          aria-label={`${stageKey} 자음 선택`}
          value={consonant}
          onChange={(event) => {
            setConsonant(event.target.value);
            setConsonantErr(null);
          }}
        >
          <option value="">자음 선택</option>
          {choices.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
        {consonantErr ? (
          <small className="acct-error" role="alert">
            {consonantErr}
          </small>
        ) : null}
      </div>
      <div className="co-add-field">
        <input
          aria-label={`${stageKey} 쉬운 뜻`}
          placeholder="쉬운 뜻"
          value={gloss}
          onChange={(event) => setGloss(event.target.value)}
        />
      </div>
      <div className="co-add-field co-add-example">
        <input
          aria-label={`${stageKey} 생활 예문`}
          placeholder="생활 예문 (직접 작성)"
          value={example}
          onChange={(event) => setExample(event.target.value)}
        />
      </div>
      <div className="co-add-submit">
        <button type="submit" disabled={busy}>
          {busy ? "추가 중…" : "추가"}
        </button>
      </div>
      {confirmDup ? (
        <div className="co-dup-confirm" role="status">
          <span>이미 있는 단어예요. 그래도 추가할까요?</span>
          <button type="button" disabled={busy} onClick={() => void doCreate()}>
            그래도 추가
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirmDup(false)}>
            취소
          </button>
        </div>
      ) : null}
      {submitErr ? (
        <p className="acct-error" role="alert">
          {submitErr}
        </p>
      ) : null}
    </form>
  );
}

function ContentRow({
  item,
  busy,
  readOnly,
  ttsReady,
  editing,
  focusField,
  historyOpen,
  choices,
  generatingKey,
  confirmGen,
  genError,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onToggleHistory,
  onPlay,
  onRequestGenerate,
  onConfirmGenerate,
  onCancelGenerate,
}: {
  item: ContentItemView;
  busy: boolean;
  readOnly: boolean;
  ttsReady: boolean;
  editing: boolean;
  focusField: "word" | "example";
  historyOpen: boolean;
  choices: readonly string[];
  generatingKey: string | null;
  confirmGen: ConfirmGen | null;
  genError: { itemId: string; message: string } | null;
  onStartEdit: (focus: "word" | "example") => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onToggleHistory: () => void;
  onPlay: (url: string, label: string) => void;
  onRequestGenerate: (confirm: ConfirmGen) => void;
  onConfirmGenerate: (confirm: ConfirmGen) => void;
  onCancelGenerate: () => void;
}) {
  const wordGeneratingVoice =
    generatingKey && generatingKey.startsWith(`${item.id}:word:`) ? generatingKey.slice(`${item.id}:word:`.length) : null;
  const generatingVoiceFor = (exampleIndex: number) => {
    const prefix = exampleIndex > 1 ? `${item.id}:sentence${exampleIndex}:` : `${item.id}:sentence:`;
    return generatingKey && generatingKey.startsWith(prefix) ? generatingKey.slice(prefix.length) : null;
  };
  const exampleCount = (item.example ? 1 : 0) + (item.extraExamples?.length ?? 0);
  const showCellConfirm = confirmGen && confirmGen.origin === "cell" && confirmGen.itemId === item.id;
  const showItemError = genError && genError.itemId === item.id;

  return (
    <>
      <tr>
        <th scope="row" data-label="단어">
          <div className="co-word-cell">
            {readOnly ? (
              <strong>{item.word}</strong>
            ) : (
              <button
                type="button"
                className="co-word-btn"
                aria-expanded={editing}
                onClick={() => (editing ? onCancelEdit() : onStartEdit("word"))}
              >
                {item.word}
              </button>
            )}
            <span className="co-meta-line">
              <span>{item.consonant}</span>
              {item.pos ? <span>· {item.pos}</span> : null}
              {item.status === "draft" ? <span className="tc-pill">초안</span> : null}
              {!readOnly ? (
                <button
                  type="button"
                  className="tc-ul co-history-btn"
                  aria-expanded={historyOpen}
                  aria-label={`${item.word} 기록`}
                  onClick={onToggleHistory}
                >
                  기록
                </button>
              ) : null}
            </span>
          </div>
        </th>
        <td data-label="뜻" className="co-gloss-cell">
          {item.gloss ? (
            <p>{item.gloss}</p>
          ) : (
            <p className="tc-none">뜻 없음</p>
          )}
          {item.scene ? (
            <small className="co-sub">{item.scene}</small>
          ) : null}
        </td>
        <td data-label="예문" className="co-example-cell">
          {item.example ? (
            <div className="co-example-wrap">
              {[
                { index: 1, text: item.example, audio: item.exampleAudio, turnsAudio: item.turnsAudio },
                ...(item.extraExamples ?? []),
              ].map((row) => {
                const ready = row.turnsAudio && CONTENT_VOICES.some((voice) => row.turnsAudio?.[voice.key]?.ready);
                return (
                  <div key={row.index} className="co-example-item">
                    <p>
                      {(item.extraExamples?.length ?? 0) > 0 ? <span className="co-example-num">{row.index}</span> : null}
                      {row.text}
                    </p>
                    <div className="co-example-audio">
                      <span className="co-sub">예문{row.index > 1 ? ` ${row.index}` : ""}</span>
                      {row.audio ? (
                        <AudioVoiceRow
                          kindLabel={`${item.word} 예문${row.index > 1 ? ` ${row.index}` : ""}`}
                          cells={row.audio}
                          busy={busy}
                          readOnly={readOnly}
                          ttsReady={ttsReady}
                          generatingVoice={generatingVoiceFor(row.index)}
                          onPlay={onPlay}
                          onRequestGenerate={(voiceKey, voiceName, cell) =>
                            onRequestGenerate({
                              itemId: item.id,
                              word: item.word,
                              kind: "sentence",
                              exampleIndex: row.index,
                              voiceKey,
                              voiceName,
                              stalePlayUrl: cell.state === "stale" ? cell.playUrl : null,
                              origin: "cell",
                            })
                          }
                        />
                      ) : null}
                      <span className="co-turns-note">
                        또박또박:{" "}
                        {ready
                          ? CONTENT_VOICES.filter((voice) => row.turnsAudio?.[voice.key]?.ready).map((voice) => {
                              const turns = row.turnsAudio?.[voice.key];
                              return turns?.playUrl ? (
                                <button
                                  key={voice.key}
                                  type="button"
                                  className="co-turns-play"
                                  disabled={busy}
                                  aria-label={`${voice.voice} ${item.word} 예문 ${row.index} 또박또박 재생`}
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
                );
              })}
              {!readOnly && exampleCount < 5 ? (
                <button type="button" className="tc-ul co-inline-link" onClick={() => onStartEdit("example")}>
                  예문 추가 ({exampleCount}/5)
                </button>
              ) : null}
            </div>
          ) : (
            <p className="tc-none">
              예문 없음
              {!readOnly ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="tc-ul co-inline-link"
                    onClick={() => onStartEdit("example")}
                  >
                    예문 쓰기
                  </button>
                </>
              ) : null}
            </p>
          )}
        </td>
        <td data-label="음원 E · S · C" className="co-audio-col">
          <AudioVoiceRow
            kindLabel={`${item.word} 단어`}
            cells={item.wordAudio}
            busy={busy}
            readOnly={readOnly}
            ttsReady={ttsReady}
            generatingVoice={wordGeneratingVoice}
            onPlay={onPlay}
            onRequestGenerate={(voiceKey, voiceName, cell) =>
              onRequestGenerate({
                itemId: item.id,
                word: item.word,
                kind: "word",
                voiceKey,
                voiceName,
                stalePlayUrl: cell.state === "stale" ? cell.playUrl : null,
                origin: "cell",
              })
            }
          />
        </td>
      </tr>
      {showCellConfirm || showItemError ? (
        <tr className="co-gen-row">
          <td colSpan={4}>
            {showCellConfirm ? (
              <div className="co-gen-confirm" role="region" aria-label={`${confirmGen.word} ${confirmGen.voiceName} 음성 생성 확인`}>
                <span>
                  {confirmGen.voiceName} · {confirmGen.kind === "word" ? "단어" : "예문"} · <strong>1건 사용</strong>
                </span>
                <button
                  type="button"
                  disabled={Boolean(generatingKey)}
                  onClick={() => onConfirmGenerate(confirmGen)}
                >
                  만들기
                </button>
                {confirmGen.stalePlayUrl ? (
                  <button
                    type="button"
                    className="tc-ul"
                    disabled={busy}
                    onClick={() => onPlay(confirmGen.stalePlayUrl as string, `${confirmGen.voiceName} 기존 음원`)}
                  >
                    기존 듣기
                  </button>
                ) : null}
                <button type="button" className="tc-ul" disabled={Boolean(generatingKey)} onClick={onCancelGenerate}>
                  취소
                </button>
              </div>
            ) : null}
            {showItemError ? (
              <p className="acct-error" role="alert">
                {genError.message}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
      {editing ? (
        <InlineEditPanel item={item} choices={choices} focusField={focusField} onSaved={onSaved} onCancel={onCancelEdit} />
      ) : null}
      {historyOpen ? <HistoryPanel item={item} /> : null}
    </>
  );
}

function DraftReviewList({
  drafts,
  busy,
  readOnly,
  ttsReady,
  reviewBusyId,
  generatingKey,
  confirmGen,
  genError,
  onPlay,
  onRequestRegenerate,
  onConfirmGenerate,
  onCancelGenerate,
  onApprove,
  onReject,
}: {
  drafts: DraftAudioReviewRow[];
  busy: boolean;
  readOnly: boolean;
  ttsReady: boolean;
  reviewBusyId: string | null;
  generatingKey: string | null;
  confirmGen: ConfirmGen | null;
  genError: { itemId: string; message: string } | null;
  onPlay: (url: string, label: string) => void;
  onRequestRegenerate: (confirm: ConfirmGen) => void;
  onConfirmGenerate: (confirm: ConfirmGen) => void;
  onCancelGenerate: () => void;
  onApprove: (assetId: string) => void;
  onReject: (assetId: string) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div className="co-drafts" role="region" aria-label="음원 초안 검수">
      <p className="co-drafts-title">음원 초안 검수 · {drafts.length}건</p>
      <ul className="co-draft-list">
        {drafts.map((row) => {
          const isRowBusy = reviewBusyId === row.assetId;
          const isRegenHere =
            confirmGen?.origin === "draft" && confirmGen.draftAssetId === row.assetId;
          const isGenerating =
            Boolean(row.itemId && generatingKey === `${row.itemId}:${row.kind}:${row.voiceKey}`);
          const kindSuffix = row.kind === "sentence" ? " 예문" : "";
          const canRegen =
            !readOnly && ttsReady && Boolean(row.itemId) && (row.kind === "word" || row.kind === "sentence");

          return (
            <li key={row.assetId} className="co-draft-item">
              <div className="co-draft-row">
                <span className="co-draft-meta">
                  <span className="tc-pill">초안</span>{" "}
                  <strong>
                    {row.word}
                    {kindSuffix}
                  </strong>{" "}
                  · {row.voiceLabel} — {formatDurationSec(row.durationMs)} · {formatRelativeTime(row.generatedAt)}
                </span>
                <div className="co-draft-actions">
                  {row.playUrl ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPlay(row.playUrl as string, `${row.word} ${row.voiceLabel} 초안`)}
                    >
                      듣기
                    </button>
                  ) : null}
                  {canRegen ? (
                    <button
                      type="button"
                      disabled={Boolean(generatingKey) || isRowBusy}
                      onClick={() =>
                        onRequestRegenerate({
                          itemId: row.itemId as string,
                          word: row.word,
                          kind: row.kind as "word" | "sentence",
                          voiceKey: row.voiceKey,
                          voiceName: row.voiceLabel,
                          stalePlayUrl: null,
                          origin: "draft",
                          draftAssetId: row.assetId,
                        })
                      }
                    >
                      {isGenerating ? "만드는 중…" : "다시"}
                    </button>
                  ) : null}
                  {!readOnly ? (
                    <>
                      <button type="button" disabled={isRowBusy} onClick={() => onApprove(row.assetId)}>
                        {isRowBusy ? "처리 중…" : "승인"}
                      </button>
                      <button type="button" className="tc-ul" disabled={isRowBusy} onClick={() => onReject(row.assetId)}>
                        제외
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {isRegenHere ? (
                <div className="co-gen-confirm" role="region" aria-label={`${row.word} ${row.voiceLabel} 다시 만들기 확인`}>
                  <span>1건 사용</span>
                  <button
                    type="button"
                    disabled={Boolean(generatingKey)}
                    onClick={() => onConfirmGenerate(confirmGen)}
                  >
                    만들기
                  </button>
                  <button type="button" className="tc-ul" disabled={Boolean(generatingKey)} onClick={onCancelGenerate}>
                    취소
                  </button>
                </div>
              ) : null}
              {row.itemId && genError?.itemId === row.itemId && isRegenHere ? (
                <p className="acct-error" role="alert">
                  {genError.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StageAccordion({
  groupId,
  choices,
  existingWords,
  stage,
  open,
  busy,
  readOnly,
  ttsReady,
  editingId,
  focusField,
  historyId,
  generatingKey,
  confirmGen,
  genError,
  reviewBusyId,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onToggleHistory,
  onChanged,
  onPlay,
  onRequestGenerate,
  onConfirmGenerate,
  onCancelGenerate,
  onApproveDraft,
  onRejectDraft,
}: {
  groupId: string;
  choices: readonly string[];
  existingWords: ReadonlySet<string>;
  stage: ContentStageSection;
  open: boolean;
  busy: boolean;
  readOnly: boolean;
  ttsReady: boolean;
  editingId: string | null;
  focusField: "word" | "example";
  historyId: string | null;
  generatingKey: string | null;
  confirmGen: ConfirmGen | null;
  genError: { itemId: string; message: string } | null;
  reviewBusyId: string | null;
  onToggle: () => void;
  onStartEdit: (id: string, focus: "word" | "example") => void;
  onCancelEdit: () => void;
  onToggleHistory: (id: string) => void;
  onChanged: () => void;
  onPlay: (url: string, label: string) => void;
  onRequestGenerate: (confirm: ConfirmGen) => void;
  onConfirmGenerate: (confirm: ConfirmGen) => void;
  onCancelGenerate: () => void;
  onApproveDraft: (assetId: string) => void;
  onRejectDraft: (assetId: string) => void;
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
        <>
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
                  <Fragment key={item.id}>
                    <ContentRow
                      item={item}
                      busy={busy}
                      readOnly={readOnly}
                      ttsReady={ttsReady}
                      editing={editingId === item.id}
                      focusField={focusField}
                      historyOpen={historyId === item.id}
                      choices={choices}
                      generatingKey={generatingKey}
                      confirmGen={confirmGen}
                      genError={genError}
                      onStartEdit={(focus) => onStartEdit(item.id, focus)}
                      onCancelEdit={onCancelEdit}
                      onSaved={() => {
                        onCancelEdit();
                        onChanged();
                      }}
                      onToggleHistory={() => onToggleHistory(item.id)}
                      onPlay={onPlay}
                      onRequestGenerate={onRequestGenerate}
                      onConfirmGenerate={onConfirmGenerate}
                      onCancelGenerate={onCancelGenerate}
                    />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <DraftReviewList
            drafts={stage.draftAudios}
            busy={busy}
            readOnly={readOnly}
            ttsReady={ttsReady}
            reviewBusyId={reviewBusyId}
            generatingKey={generatingKey}
            confirmGen={confirmGen}
            genError={genError}
            onPlay={onPlay}
            onRequestRegenerate={onRequestGenerate}
            onConfirmGenerate={onConfirmGenerate}
            onCancelGenerate={onCancelGenerate}
            onApprove={onApproveDraft}
            onReject={onRejectDraft}
          />
          {!readOnly ? (
            <AddWordRow
              groupId={groupId}
              stageKey={stage.key}
              choices={choices}
              existingWords={existingWords}
              onAdded={onChanged}
            />
          ) : null}
        </>
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
  const [editing, setEditing] = useState<{ id: string; focus: "word" | "example" } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [confirmGen, setConfirmGen] = useState<ConfirmGen | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [genError, setGenError] = useState<{ itemId: string; message: string } | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

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
    setEditing(null);
    setHistoryId(null);
    setConfirmGen(null);
    setGenError(null);
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

  const confirmGenerate = async (target: ConfirmGen) => {
    const key =
      target.kind === "sentence" && (target.exampleIndex ?? 1) > 1
        ? `${target.itemId}:sentence${target.exampleIndex}:${target.voiceKey}`
        : `${target.itemId}:${target.kind}:${target.voiceKey}`;
    setGeneratingKey(key);
    setGenError(null);
    try {
      await teacherApi.generateContentAudio(target.itemId, {
        kind: target.kind,
        voice: target.voiceKey,
        ...(target.kind === "sentence" ? { exampleIndex: target.exampleIndex ?? 1 } : {}),
      });
      setConfirmGen(null);
      load();
    } catch (error) {
      const msg =
        error instanceof PreviewApiError && error.serverMessage
          ? error.serverMessage
          : "음성을 만들지 못했어요. 다시 시도해 주세요.";
      setGenError({ itemId: target.itemId, message: msg });
    } finally {
      setGeneratingKey(null);
      window.dispatchEvent(new Event("haeon:tts-usage-refresh"));
    }
  };

  const approveDraft = async (assetId: string) => {
    setReviewBusyId(assetId);
    try {
      await teacherApi.approveContentAudio(assetId);
      setConfirmGen(null);
      load();
    } finally {
      setReviewBusyId(null);
    }
  };

  const rejectDraft = async (assetId: string) => {
    setReviewBusyId(assetId);
    try {
      await teacherApi.rejectContentAudio(assetId);
      setConfirmGen(null);
      load();
    } finally {
      setReviewBusyId(null);
    }
  };

  const busy = practice.playing !== null;
  const existingWords = new Set(view?.stages.flatMap((s) => s.items.map((item) => item.word)) ?? []);
  const displayedStages = view?.stages ?? [];
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
          <div className="co-top-bar">
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
          </div>

          <StageZeroTable rows={view.stage0} busy={busy} onPlay={playUrl} />

          {displayedStages.map((stage) => (
            <StageAccordion
              key={stage.key}
              groupId={view.group.id}
              choices={view.group.choices}
              existingWords={existingWords}
              stage={stage}
              open={expandedSet.has(stage.key)}
              busy={busy}
              readOnly={!view.writable}
              ttsReady={view.ttsReady}
              editingId={editing?.id ?? null}
              focusField={editing?.focus ?? "word"}
              historyId={historyId}
              generatingKey={generatingKey}
              confirmGen={confirmGen}
              genError={genError}
              reviewBusyId={reviewBusyId}
              onToggle={() => toggleStage(stage.key)}
              onStartEdit={(id, focus) => setEditing({ id, focus })}
              onCancelEdit={() => setEditing(null)}
              onToggleHistory={(id) => setHistoryId((prev) => (prev === id ? null : id))}
              onChanged={load}
              onPlay={playUrl}
              onRequestGenerate={(confirm) => {
                setGenError(null);
                setConfirmGen(confirm);
              }}
              onConfirmGenerate={(confirm) => void confirmGenerate(confirm)}
              onCancelGenerate={() => {
                setConfirmGen(null);
                setGenError(null);
              }}
              onApproveDraft={(assetId) => void approveDraft(assetId)}
              onRejectDraft={(assetId) => void rejectDraft(assetId)}
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

          {view.writable ? <ReleaseBar release={view.release} onPublished={load} /> : null}
        </>
      ) : null}
    </div>
  );
}

function ReleaseBar({
  release,
  onPublished,
}: {
  release: ContentReleaseStatusView;
  onPublished: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDoneMessage(null);
    try {
      const res = await teacherApi.publishRelease(note.trim() || undefined);
      setConfirming(false);
      setNote("");
      setDoneMessage(`제${res.release.seq}판으로 내보냈어요.`);
      onPublished();
    } catch {
      setError("내보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tc-section co-release-bar" aria-label="학습자에게 내보내기">
      <div className="co-release-head">
        <div className="co-release-summary">
          <p className="co-release-counts">
            검수 대기 {release.pendingReviewCount} · 승인했지만 아직 안 나간 것 {release.unpublishedApprovedCount}
            {release.staleAudioCount > 0 ? ` · 다시 만들 음원 ${release.staleAudioCount}` : ""}
          </p>
          <p className="co-sub">
            {release.latestSeq !== null
              ? `마지막 내보내기: 제${release.latestSeq}판 · ${formatDay(release.latestReleasedAt)}${release.latestNote ? ` · ${release.latestNote}` : ""}`
              : "아직 내보낸 판이 없어요."}
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            className="co-release-primary"
            onClick={() => {
              setConfirming(true);
              setError(null);
              setDoneMessage(null);
            }}
          >
            학습자에게 내보내기
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="co-release-confirm" role="region" aria-label="내보내기 확인">
          <p>
            단어 {release.nextItemCount}개, 음원 {release.nextAudioCount}개가 학습자 화면에 반영돼요.
          </p>
          <div className="co-release-confirm-row">
            <input
              type="text"
              aria-label="내보내기 메모 (선택)"
              placeholder="메모 (선택)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="button" className="co-release-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "내보내는 중…" : "지금 내보내기"}
            </button>
            <button
              type="button"
              className="tc-ul"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {doneMessage ? (
        <p className="co-release-done" role="status">
          {doneMessage}
        </p>
      ) : null}
      {error ? (
        <p className="acct-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
