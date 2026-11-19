// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { LearnerDetail, MeView, SessionView, TeacherView, WordView } from "../server/preview/contract.ts";
import { exampleDetail } from "../server/preview/example.ts";
import { LearnRoutes } from "./App";
import { peekInviteToken, resetInviteTokenMemory } from "./join-token";
import { PreviewSettingsProvider } from "./preview/settings";
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
      kind: "pseudo",
      step: null,
      stepLabel: null,
      syllableIndex: 2,
      vowel: "ㅏ",
    },
  ],
  answers: [],
  skipped: [],
  finished: false,
  voice: "Iapetus",
  itemKind: "pseudo",
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
  wordVoice: null,
  exampleVoice: null,
  step: 3,
  stepLabel: "실전 어휘 일반화",
  pairGroupId: null,
  contrastTier: null,
  partners: [],
  dict: null,
};

const previewDetail: LearnerDetail = {
  ...exampleDetail(),
  learner: {
    id: "learner-1",
    name: "알렉세이",
    languages: "러시아어 · 사전 Русский",
    kind: "learner",
    lastActive: "2026-11-17T01:00:00.000Z",
    days: 1,
    note: "ㅊ을 ㅉ으로 2번 골랐어요",
    activeMs: 120_000,
    medial: { correct: 5, total: 9 },
    initial: { correct: 0, total: 0 },
    audioErrors: 0,
  },
  isExample: false,
};

const me: MeView = {
  learner: { id: "learner-1", nickname: "알렉세이" },
  settings: { style: "proto", items: "pseudo", dictLanguage: "ru", practiceVoice: "charon", exampleReading: "spoken" },
  practiceVoices: [],
};

const teacherView: TeacherView = {
  teacher: { displayName: "김해온" },
  inviteOrigin: "http://127.0.0.1:4174",
  learners: [
    {
      id: "learner-1",
      nickname: "알렉세이",
      classLabel: null,
      homeLanguage: "ru",
      dictLanguage: "ru",
      isTest: false,
      invite: { status: "used", expiresAt: null, createdAt: null },
      devices: 1,
      summary: previewDetail.learner,
    },
  ],
};

const unauthorized = { __status: 401, error: "not_connected" };

function stubPreviewApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`;
      if (key === "POST /api/learn/events") {
        return new Response(JSON.stringify({ accepted: 1, duplicates: 0 }), { status: 200 });
      }
      if (!(key in routes)) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      const body = routes[key] as Record<string, unknown>;
      const status = typeof body?.__status === "number" ? body.__status : 200;
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderAt(path: string, live: boolean) {
  const runtime: LearnRuntime = {
    ready: true,
    api: "ok",
    origin: null,
    screenPreview: live,
    accounts: live,
  };

  return render(
    <MemoryRouter initialEntries={[path]}>
      <PreviewSettingsProvider enabled={live}>
        <Shell runtime={runtime}>
          <LearnRoutes live={live} />
        </Shell>
      </PreviewSettingsProvider>
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

  it("runs the quiz for the connected learner without showing the answer first", async () => {
    stubPreviewApi({ "GET /api/me": me, "GET /api/learn/sessions/current": { session: previewSession } });
    renderAt("/practice", true);
    expect(await screen.findByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소리 듣기" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /아짜/ }));
    expect(screen.getByRole("button", { name: /아짜/ })).toHaveAttribute("aria-pressed", "true");
    // 소리를 끝까지 듣기 전에는 고른 답을 보낼 수 없다.
    expect(screen.getByRole("button", { name: "선택 확인" })).toBeDisabled();
    expect(screen.queryByText("정답")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "학습 메뉴" })).toHaveTextContent("설정");
    expect(screen.getByText("알렉세이 님")).toBeInTheDocument();
    expect(screen.queryByText(/브라우저 음성/)).not.toBeInTheDocument();
  });

  it("shows a device that is not connected the invitation guide instead of the quiz", async () => {
    stubPreviewApi({ "GET /api/me": unauthorized });
    renderAt("/practice", true);
    expect(await screen.findByRole("heading", { level: 2, name: "연결된 연습이 없어요." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /귀를 기울여요/ })).not.toBeInTheDocument();
  });

  it("shows whose invitation it is and connects only when the learner presses start", async () => {
    window.history.replaceState(null, "", "/join#token=invite-token-value-0123456789");
    stubPreviewApi({
      "GET /api/me": unauthorized,
      "POST /api/invitations/inspect": { status: "ok", nickname: "알렉세이", dictLanguage: "en" },
    });
    renderAt("/join", true);
    expect(await screen.findByRole("heading", { level: 2, name: "알렉세이 님의 연습이에요." })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("invite-token-value");
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/api/invitations/claim"))).toBe(false);
    expect(screen.getByRole("button", { name: "이 기기에서 시작하기" })).toBeEnabled();
  });

  it("lets the learner pick the screen style and dictionary language in settings", async () => {
    stubPreviewApi({ "GET /api/me": me });
    renderAt("/settings", true);
    expect(await screen.findByRole("heading", { level: 2, name: "설정" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "화면 모양" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "시안" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "사전에서 볼 언어" })).toHaveTextContent("Русский");
    expect(screen.getByRole("button", { name: "이 기기에서 나가기" })).toBeInTheDocument();
    expect(screen.queryByText(/브라우저 음성/)).not.toBeInTheDocument();
  });

  it("keeps the dictionary source and license note at the bottom of learner settings", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    stubPreviewApi({ "GET /api/me": me });
    const { container } = renderAt("/settings#dict-license", true);
    const section = within(await screen.findByRole("region", { name: "사전 자료 출처" }));
    const box = container.querySelector("#dict-license");
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent("사전 풀이는 국립국어원 한국어기초사전과 표준국어대사전에서 옮겼어요.");
    expect(box).toHaveTextContent("크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 라이선스(CC BY-SA 2.0 KR)를 따라요.");
    const links = [
      ["라이선스 전문 보기", "https://creativecommons.org/licenses/by-sa/2.0/kr/"],
      ["한국어기초사전", "https://krdict.korean.go.kr/"],
      ["표준국어대사전", "https://stdict.korean.go.kr/"],
    ] as const;
    for (const [name, href] of links) {
      const link = section.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(box?.parentElement?.lastElementChild).toBe(box);
    expect(scrolled).toHaveBeenCalled();
  });

  it("shows a quiet dictionary empty state when the word has no approved entry", async () => {
    stubPreviewApi({ "GET /api/me": me, "GET /api/learn/words": { words: [previewWord] } });
    renderAt("/dictionary", true);
    expect(await screen.findByRole("heading", { level: 2, name: "모자" })).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /사전 풀이/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("이 낱말의 사전 풀이는 아직 준비하고 있어요.")).toBeInTheDocument();
    const panel = within(toggle.closest("section") as HTMLElement);
    expect(panel.queryByText(/검수 전/)).not.toBeInTheDocument();
    expect(panel.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(["네이버 사전 새 창으로 열기"]);
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

  it("asks a teacher to log in and shows only the teacher's learners", async () => {
    renderAt("/teach", false);
    expect(screen.getByRole("heading", { level: 2, name: "교사 인증 전" })).toBeInTheDocument();

    cleanup();
    stubPreviewApi({ "GET /api/me": unauthorized, "GET /api/teacher/learners": { ...unauthorized, error: "teacher_login_required" } });
    renderAt("/teach", true);
    expect(await screen.findByRole("heading", { level: 2, name: "교사 로그인" })).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "password");

    cleanup();
    stubPreviewApi({
      "GET /api/me": unauthorized,
      "GET /api/teacher/learners": teacherView,
      "GET /api/teacher/learners/learner-1": { detail: previewDetail },
    });
    renderAt("/teach/detail?learner=learner-1", true);
    expect(await screen.findByRole("heading", { level: 2, name: "알렉세이" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "모음 맥락" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "살펴볼 점" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /듣고 세 소리 고르기 · 모음 사이/ });
    expect(table.querySelectorAll("td")).toHaveLength(9);
    expect(screen.getByText("김해온 선생님")).toBeInTheDocument();
  });

  it("lets the teacher add learners and make invitation links", async () => {
    stubPreviewApi({ "GET /api/me": unauthorized, "GET /api/teacher/learners": teacherView });
    renderAt("/teach", true);
    expect(await screen.findByRole("heading", { level: 3, name: "학습자 관리" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "학습자 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "링크 새로 만들기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기기 연결 끊기" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "담당 학습자와 초대 상태" })).toHaveTextContent("연결됨");
  });
});
