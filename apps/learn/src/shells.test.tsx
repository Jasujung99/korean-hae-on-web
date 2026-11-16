// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { LearnerDetail, SessionView, WordView } from "../server/preview/contract.ts";
import { exampleDetail } from "../server/preview/example.ts";
import { LearnRoutes } from "./App";
import { peekInviteToken, resetInviteTokenMemory } from "./join-token";
import type { LearnRuntime } from "./runtime";
import { Shell } from "./shell";

afterEach(() => {
  cleanup();
  resetInviteTokenMemory();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

const previewSession: SessionView = {
  sessionId: "session-test",
  groupId: "j_ch_jj",
  groupLabel: "ㅈ · ㅊ · ㅉ",
  policyVersion: "balanced-v1",
  items: [
    {
      itemId: "jcj-s1-아차",
      choices: [
        { key: "ㅈ", text: "아자" },
        { key: "ㅊ", text: "아차" },
        { key: "ㅉ", text: "아짜" },
      ],
      audioRef: "ref-a",
      positionLabel: "모음 사이",
      stage: "Stage 1",
      slotKind: "common",
    },
  ],
  answers: [],
  skipped: [],
  finished: false,
  voice: "Iapetus",
};

const previewWord: WordView = {
  id: "w-1871",
  word: "모자",
  pos: "명",
  consonant: "ㅈ",
  substage: "1-A",
  positionLabel: "모음 사이",
  gloss: "머리에 쓰는 물건.",
  scene: "외출할 때",
  example: "햇빛이 강해서 모자를 썼어요.",
  related: "모자를 쓰다",
  wordAudioRef: "ref-w",
  exampleAudioRef: "ref-s",
};

const previewDetail: LearnerDetail = {
  ...exampleDetail(),
  learner: {
    id: "preview-learner",
    name: "미리보기 학습자",
    languages: "언어 정보 없음",
    kind: "preview",
    lastActive: "2026-11-17T01:00:00.000Z",
    days: 1,
    note: "ㅊ → ㅉ 선택 2회",
  },
  isExample: false,
};

function stubPreviewApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`;
      if (key === "POST /api/preview/events") {
        return new Response(JSON.stringify({ accepted: 1, duplicates: 0 }), { status: 200 });
      }
      if (!(key in routes)) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderAt(path: string, preview: boolean) {
  const runtime: LearnRuntime = {
    ready: true,
    api: "ok",
    origin: null,
    screenPreview: preview,
  };

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell runtime={runtime}>
        <LearnRoutes preview={preview} />
      </Shell>
    </MemoryRouter>,
  );
}

describe("stage 1 shells", () => {
  it("shows the unconnected common address instead of the quiz", () => {
    renderAt("/", false);
    expect(screen.getByRole("heading", { level: 2, name: "연결된 연습이 없습니다." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /귀를 기울여요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();
  });

  it("keeps an invite token in memory and removes it from the address", () => {
    window.history.replaceState(null, "", "/join?from=letter#token=secret-token-value");
    renderAt("/join", false);
    expect(window.location.pathname).toBe("/join");
    expect(window.location.search).toBe("?from=letter");
    expect(window.location.hash).toBe("");
    expect(document.body.textContent).not.toContain("secret-token-value");
    expect(peekInviteToken()).toBe("secret-token-value");
    expect(screen.getByRole("button", { name: "이 기기에서 시작하기" })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toContain("초대를 소비하지 않습니다");
  });

  it("shows a disabled listening shell that does not record a choice", () => {
    renderAt("/practice", false);
    expect(screen.getByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "아직 준비 중" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /아자/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "선택 확인" })).toBeDisabled();
    expect(screen.getByRole("status").textContent).toContain("저장하지 않습니다");
    expect(screen.getByText(/재생 실패, 무음, 잘림, 재생 중 응답/)).toBeInTheDocument();
    expect(screen.queryByText(/정답|41분|\d+\s*\/\s*\d+/)).not.toBeInTheDocument();
  });

  it("runs the dev preview quiz from the preview API without showing the answer first", async () => {
    stubPreviewApi({ "GET /api/preview/sessions/current": { session: previewSession } });
    renderAt("/practice", true);
    expect(await screen.findByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소리 듣기" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /아짜/ }));
    expect(screen.getByRole("button", { name: /아짜/ })).toHaveAttribute("aria-pressed", "true");
    // 소리를 끝까지 듣기 전에는 고른 답을 보낼 수 없다.
    expect(screen.getByRole("button", { name: "선택 확인" })).toBeDisabled();
    expect(screen.queryByText("정답")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "학습 메뉴" })).toHaveTextContent("학습 순서");
  });

  it("marks dictionary places as empty slots in the dev preview", async () => {
    stubPreviewApi({ "GET /api/preview/words": { words: [previewWord] } });
    renderAt("/dictionary", true);
    expect(await screen.findByRole("heading", { level: 2, name: "모자" })).toBeInTheDocument();
    for (const option of ["A", "C", "D"]) {
      expect(screen.getByRole("region", { name: new RegExp(`사전 자리 ${option}\\.`) })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/아직 연결하지 않음/).length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole("link", { name: /krdict|stdict|naver/i })).not.toBeInTheDocument();
  });

  it("opens the comparison, finish, and dictionary placeholders", () => {
    renderAt("/compare", false);
    expect(screen.getByRole("heading", { level: 2, name: "X는 어느 쪽과 같나요?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A 듣기 · 준비 중" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "A와 같아요" }));
    expect(screen.getByRole("status").textContent).toContain("자음 식별 기록과도 합치지 않습니다");

    cleanup();
    renderAt("/finish", false);
    expect(screen.getByRole("heading", { level: 2, name: /아직 집계하지 않아요/ })).toBeInTheDocument();
    expect(screen.queryByText(/정답/)).not.toBeInTheDocument();

    cleanup();
    renderAt("/dictionary", false);
    expect(screen.getByRole("heading", { level: 2, name: "단어 자리" })).toBeInTheDocument();
    expect(screen.getByText("검수 전이라 뜻을 표시하지 않습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 단어에 담기 · 준비 중" })).toBeDisabled();
  });

  it("keeps teacher observation behind the preview gate and reads preview records in the dev preview", async () => {
    renderAt("/teach", false);
    expect(screen.getByRole("heading", { level: 2, name: "교사 인증 전" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();

    cleanup();
    stubPreviewApi({
      "GET /api/preview/teacher/learners": { learners: [previewDetail.learner, exampleDetail().learner] },
      "GET /api/preview/teacher/learners/preview-learner": { detail: previewDetail },
      "GET /api/preview/sessions/current": { session: previewSession },
    });
    renderAt("/teach/detail?learner=preview-learner", true);
    expect(await screen.findByRole("heading", { level: 2, name: "미리보기 학습자" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "개발 미리보기 역할" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "모음 맥락" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /듣고 세 소리 고르기 · 모음 사이/ });
    expect(table.querySelectorAll("td")).toHaveLength(9);
    expect(screen.getByText("예시")).toBeInTheDocument();
    expect(screen.getByText(/총시간에서 두 번 빼지 않아요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "학습자" }));
    expect(await screen.findByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
  });
});
