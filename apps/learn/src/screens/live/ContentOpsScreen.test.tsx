// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeacherContentView, TeacherView, TtsUsageView } from "../../../server/preview/contract.ts";
import { LearnRoutes } from "../../App";
import { PreviewSettingsProvider } from "../../preview/settings";
import type { LearnRuntime } from "../../runtime";
import { Shell } from "../../shell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const teacherView: TeacherView = {
  teacher: { displayName: "김해온" },
  inviteOrigin: "http://127.0.0.1:4174",
  learners: [],
};

const usageView: TtsUsageView = {
  quotaDay: "2026-11-19",
  limit: 100,
  used: 12,
  remaining: 88,
  bySource: { ui_single: 2, pc_batch: 10 },
  ttsReady: false,
};

function makeContentView(groupId: string): TeacherContentView {
  const isJcj = groupId === "j_ch_jj";
  const stageKey = isJcj ? "Stage 1-A" : "Stage 1";
  const word = isJcj ? "모자" : "사과";
  const consonant = isJcj ? "ㅈ" : "ㅅ";
  return {
    groups: [
      { id: "j_ch_jj", label: "ㅈ · ㅊ · ㅉ", choices: ["ㅈ", "ㅊ", "ㅉ"], count: 103 },
      { id: "s_ss", label: "ㅅ · ㅆ", choices: ["ㅅ", "ㅆ"], count: 42 },
      { id: "g_k_kk", label: "ㄱ · ㅋ · ㄲ", choices: ["ㄱ", "ㅋ", "ㄲ"], count: 61 },
      { id: "b_p_pp", label: "ㅂ · ㅍ · ㅃ", choices: ["ㅂ", "ㅍ", "ㅃ"], count: 59 },
      { id: "d_t_tt", label: "ㄷ · ㅌ · ㄸ", choices: ["ㄷ", "ㅌ", "ㄸ"], count: 60 },
    ],
    group: {
      id: groupId,
      label: isJcj ? "ㅈ · ㅊ · ㅉ" : "ㅅ · ㅆ",
      choices: isJcj ? ["ㅈ", "ㅊ", "ㅉ"] : ["ㅅ", "ㅆ"],
    },
    stage0: [
      {
        id: "p1",
        groupId,
        kind: "pseudoword",
        consonant,
        stimulus: isJcj ? "아자" : "아사",
        word: null,
        context: "medial_vcv",
        audio: {
          erinome: { state: "approved", assetId: null, audioId: "a1", playUrl: "/api/sound/r1", durationMs: 600, generatedAt: null, source: "import" },
          sulafat: { state: "missing", assetId: null, audioId: "a2", playUrl: null, durationMs: null, generatedAt: null, source: null },
          charon: { state: "missing", assetId: null, audioId: "a3", playUrl: null, durationMs: null, generatedAt: null, source: null },
        },
      },
    ],
    stages: [
      {
        key: stageKey,
        title: "모음 사이",
        totalCount: 1,
        approvedCount: 1,
        draftCount: 0,
        draftAudios: [],
        items: [
          {
            id: "item-1",
            legacyId: "legacy-1",
            groupId,
            stage: "Stage 1",
            substage: isJcj ? "1-A" : null,
            consonant,
            word,
            entryId: 100,
            pos: "명",
            gloss: "뜻",
            scene: "장면",
            example: "예문이에요.",
            related: "",
            note: "",
            sortOrder: 1,
            source: "roadmap_seed",
            status: "approved",
            wordAudio: {
              erinome: { state: "approved", assetId: null, audioId: "w1", playUrl: "/api/sound/w1", durationMs: 700, generatedAt: null, source: "import" },
              sulafat: { state: "draft", assetId: "d1", audioId: "w2", playUrl: "/api/sound/w2", durationMs: 720, generatedAt: null, source: "ui_single" },
              charon: { state: "missing", assetId: null, audioId: "w3", playUrl: null, durationMs: null, generatedAt: null, source: null },
            },
            exampleAudio: {
              erinome: { state: "missing", assetId: null, audioId: "s1", playUrl: null, durationMs: null, generatedAt: null, source: null },
              sulafat: { state: "missing", assetId: null, audioId: "s2", playUrl: null, durationMs: null, generatedAt: null, source: null },
              charon: { state: "missing", assetId: null, audioId: "s3", playUrl: null, durationMs: null, generatedAt: null, source: null },
            },
            turnsAudio: null,
          },
        ],
      },
      {
        key: "Stage 2",
        title: "받침·비음 뒤",
        totalCount: 1,
        approvedCount: 1,
        draftCount: 0,
        draftAudios: [],
        items: [
          {
            id: "item-2",
            legacyId: "legacy-2",
            groupId,
            stage: "Stage 2",
            substage: null,
            consonant,
            word: isJcj ? "산책" : "인사",
            entryId: 101,
            pos: "명",
            gloss: "둘째 뜻",
            scene: "",
            example: "",
            related: "",
            note: "",
            sortOrder: 1,
            source: "roadmap_seed",
            status: "approved",
            wordAudio: {
              erinome: { state: "missing", assetId: null, audioId: "w4", playUrl: null, durationMs: null, generatedAt: null, source: null },
              sulafat: { state: "missing", assetId: null, audioId: "w5", playUrl: null, durationMs: null, generatedAt: null, source: null },
              charon: { state: "missing", assetId: null, audioId: "w6", playUrl: null, durationMs: null, generatedAt: null, source: null },
            },
            exampleAudio: null,
            turnsAudio: null,
          },
        ],
      },
    ],
    release: {
      latestSeq: null,
      latestReleasedAt: null,
      latestNote: null,
      pendingReviewCount: 0,
      draftItemCount: 0,
      draftAudioCount: 0,
      staleAudioCount: 0,
      unpublishedApprovedCount: 0,
      nextItemCount: 325,
      nextAudioCount: 0,
    },
    ttsReady: false,
    writable: false,
  };
}

function stubTeacherFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
      if (url.pathname === "/api/me") {
        return new Response(JSON.stringify({ error: "not_connected" }), { status: 401, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/api/teacher/learners") {
        return new Response(JSON.stringify(teacherView), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/api/teacher/content/usage") {
        return new Response(JSON.stringify(usageView), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.pathname === "/api/teacher/content") {
        const group = url.searchParams.get("group") || "j_ch_jj";
        return new Response(JSON.stringify(makeContentView(group)), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
}

function renderTeacher(path: string) {
  const runtime: LearnRuntime = {
    ready: true,
    api: "ok",
    origin: null,
    screenPreview: true,
    accounts: true,
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PreviewSettingsProvider enabled>
        <Shell runtime={runtime}>
          <LearnRoutes live />
        </Shell>
      </PreviewSettingsProvider>
    </MemoryRouter>,
  );
}

describe("teacher navigation and read-only content ops screen", () => {
  it("shows four common teacher tabs and TTS usage breakdown", async () => {
    stubTeacherFetch();
    renderTeacher("/teach/content");
    const nav = await screen.findByRole("navigation", { name: "교사 메뉴" });
    expect(nav).toHaveTextContent("학습자");
    expect(nav).toHaveTextContent("관찰");
    expect(nav).toHaveTextContent("콘텐츠");
    expect(nav).toHaveTextContent("목소리·음원");
    expect(screen.getByRole("link", { name: "콘텐츠" })).toHaveAttribute("aria-current", "page");

    const chip = await screen.findByRole("button", { name: /오늘 TTS 12 \/ 100/ });
    fireEvent.click(chip);
    const region = screen.getByRole("region", { name: "오늘 TTS 사용 내역" });
    expect(region).toHaveTextContent("화면 단건 2건");
    expect(region).toHaveTextContent("PC 묶음 10건");
  });

  it("guides the teacher to pick a learner when opening /teach/detail without learner param", async () => {
    stubTeacherFetch();
    renderTeacher("/teach/detail");
    expect(await screen.findByText("살펴볼 학습자를 먼저 골라 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "학습자 표로 가기" })).toHaveAttribute("href", "/teach");
  });

  it("renders group chips, Stage 0, first stage expanded, and switches groups", async () => {
    stubTeacherFetch();
    renderTeacher("/teach/content");
    expect(await screen.findByRole("button", { name: /ㅈ · ㅊ · ㅉ 103/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("모자")).toBeInTheDocument();
    expect(screen.queryByText("산책")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erinome 모자 단어 음원, 승인, 재생" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sulafat 모자 단어 음원, 초안, 재생" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Charon 모자 단어 음원, 없음, 생성 준비 안 됨" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Stage 2/ }));
    expect(screen.getByText("산책")).toBeInTheDocument();
    expect(screen.getByText("예문 없음")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ㅅ · ㅆ 42/ }));
    expect(await screen.findByText("사과")).toBeInTheDocument();
  });

  it("supports inline edit, version history, add validation, and duplicate confirmation when writable", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        if (method === "PATCH" && url.pathname === "/api/teacher/content/items/item-1") {
          return new Response(JSON.stringify({ item: view.stages[0]!.items[0], version: null, changedFields: ["gloss"], staleMarked: 0 }), { status: 200 });
        }
        if (method === "GET" && url.pathname === "/api/teacher/content/items/item-1/versions") {
          return new Response(
            JSON.stringify({
              versions: [{ version: 2, changedFields: ["gloss"], reason: "다듬기", editedBy: "t1", createdAt: "2026-11-19T12:00:00.000Z", snapshot: {} }],
            }),
            { status: 200 },
          );
        }
        if (method === "POST" && url.pathname === "/api/teacher/content/items") {
          return new Response(JSON.stringify({ item: { id: "new-item" } }), { status: 201 });
        }
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    renderTeacher("/teach/content");
    const wordBtn = await screen.findByRole("button", { name: "모자" });
    fireEvent.click(wordBtn);
    expect(screen.getByRole("form", { name: "모자 편집" })).toBeInTheDocument();
    const glossInput = screen.getByLabelText("쉬운 뜻");
    fireEvent.change(glossInput, { target: { value: "고친 뜻" } });
    fireEvent.change(screen.getByLabelText("고친 이유 (선택)"), { target: { value: "다듬기" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("button", { name: "모자 기록" })).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH" && c.path === "/api/teacher/content/items/item-1")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "모자 기록" }));
    expect(await screen.findByRole("region", { name: "모자 수정 기록" })).toHaveTextContent("v2");

    // 추가 줄 필수값 오류 및 중복 확인
    const addForm = screen.getByRole("form", { name: "Stage 1-A 새 단어 추가" });
    fireEvent.submit(addForm);
    expect(screen.getByText("새 단어를 써 주세요.")).toBeInTheDocument();
    expect(screen.getByText("자음을 골라 주세요.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Stage 1-A 새 단어"), { target: { value: "모자" } });
    fireEvent.change(screen.getByLabelText("Stage 1-A 자음 선택"), { target: { value: "ㅈ" } });
    fireEvent.submit(addForm);
    expect(screen.getByText("이미 있는 단어예요. 그래도 추가할까요?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "그래도 추가" }));
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/teacher/content/items")).toBe(true);
  });

  it("marks an approved sound for replacement, makes all marked ones, and compares the draft with the old sound", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    view.ttsReady = true;
    view.stages[0]!.draftAudios = [
      {
        assetId: "d9",
        audioId: "w9",
        itemId: "item-1",
        word: "모자",
        kind: "word",
        voiceKey: "charon",
        voiceLabel: "Charon",
        durationMs: 900,
        generatedAt: new Date().toISOString(),
        playUrl: "/api/teacher/content/audio/d9",
        previousPlayUrl: "/api/teacher/content/audio/old9",
      },
    ];
    let marks: Array<Record<string, unknown>> = [];
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        const method = (init?.method ?? "GET").toUpperCase();
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
        calls.push({ method, path: url.pathname, body });
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        if (url.pathname === "/api/teacher/content/replace-marks" && method === "GET") {
          return new Response(JSON.stringify({ marks }), { status: 200 });
        }
        if (url.pathname === "/api/teacher/content/replace-marks" && method === "POST") {
          marks = [{ ...body, word: "모자", voiceName: "Erinome" }];
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (method === "POST" && url.pathname === "/api/teacher/content/items/item-1/audio") {
          marks = [];
          return new Response(
            JSON.stringify({
              asset: { id: "d10", audioId: "w1", status: "draft", durationMs: 800, playUrl: "/api/teacher/content/audio/d10" },
              usage: usageView,
            }),
            { status: 201 },
          );
        }
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    renderTeacher("/teach/content");
    // 승인 칸의 ⟳은 바로 만들지 않고 표시만 한다(한도를 쓰지 않음).
    fireEvent.click(await screen.findByRole("button", { name: "Erinome 모자 단어 교체 표시" }));
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/teacher/content/replace-marks")).toBe(true);
    expect(calls.some((c) => c.path.endsWith("/audio"))).toBe(false);
    const bar = await screen.findByRole("region", { name: "교체 예정 음성" });
    expect(bar).toHaveTextContent("교체 예정 1개");
    expect(screen.getByRole("button", { name: "Erinome 모자 단어 지금 다시 만들기" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "모두 만들기 (1건)" }));
    await vi.waitFor(() => {
      const made = calls.find((c) => c.method === "POST" && c.path === "/api/teacher/content/items/item-1/audio");
      expect(made?.body).toEqual({ kind: "word", voice: "erinome" });
    });
    await vi.waitFor(() => expect(screen.queryByRole("region", { name: "교체 예정 음성" })).not.toBeInTheDocument());

    // 초안 줄에서 기존 승인본과 새 초안을 나란히 듣는다.
    expect(screen.getByRole("button", { name: "모자 Charon 기존 승인본 듣기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "▶ 새 초안" })).toBeInTheDocument();
  });

  it("supports inline single TTS confirmation, quota error display, and draft review approve/reject", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    view.ttsReady = true;
    view.stages[0]!.draftAudios = [
      {
        assetId: "d1",
        audioId: "w2",
        itemId: "item-1",
        word: "모자",
        kind: "word",
        voiceKey: "sulafat",
        voiceLabel: "Sulafat",
        durationMs: 1200,
        generatedAt: new Date().toISOString(),
        playUrl: "/api/teacher/content/audio/d1",
      },
    ];
    let returnQuota409 = false;
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const onUsageRefresh = vi.fn();
    window.addEventListener("haeon:tts-usage-refresh", onUsageRefresh);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        const method = (init?.method ?? "GET").toUpperCase();
        calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        if (method === "POST" && url.pathname === "/api/teacher/content/items/item-1/audio") {
          if (returnQuota409) {
            return new Response(
              JSON.stringify({
                error: "daily_quota_exceeded",
                message: "오늘 한도를 다 썼어요. 오후 5시에 다시 열려요.",
              }),
              { status: 409 },
            );
          }
          return new Response(
            JSON.stringify({
              asset: { id: "d2", audioId: "w3", status: "draft", durationMs: 800, playUrl: "/api/teacher/content/audio/d2" },
              usage: usageView,
            }),
            { status: 201 },
          );
        }
        if (method === "POST" && url.pathname === "/api/teacher/content/audio/d1/approve") {
          return new Response(JSON.stringify({ asset: { id: "d1", status: "approved" } }), { status: 200 });
        }
        if (method === "POST" && url.pathname === "/api/teacher/content/audio/d1/reject") {
          return new Response(JSON.stringify({ asset: { id: "d1", status: "rejected" } }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    try {
      renderTeacher("/teach/content");
      const genBtn = await screen.findByRole("button", { name: "Charon 모자 단어 음원, 없음, 생성" });
      // 없는 칸은 확인 줄 없이 한 번에 만든다.
      fireEvent.click(genBtn);
      expect(screen.queryByText("1건 사용")).not.toBeInTheDocument();
      await screen.findByRole("region", { name: "음원 초안 검수" });
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/teacher/content/items/item-1/audio")).toBe(true);
      expect(onUsageRefresh).toHaveBeenCalled();

      // 409 한도 초과 메시지 확인
      returnQuota409 = true;
      fireEvent.click(await screen.findByRole("button", { name: "Charon 모자 단어 음원, 없음, 생성" }));
      expect(await screen.findByText("오늘 한도를 다 썼어요. 오후 5시에 다시 열려요.")).toBeInTheDocument();

      // 초안 검수 줄: 길이·승인·제외
      const draftRegion = screen.getByRole("region", { name: "음원 초안 검수" });
      expect(draftRegion).toHaveTextContent("1.2초");
      expect(draftRegion).toHaveTextContent("Sulafat");
      fireEvent.click(screen.getByRole("button", { name: "승인" }));
      await vi.waitFor(() => {
        expect(calls.some((c) => c.method === "POST" && c.path === "/api/teacher/content/audio/d1/approve")).toBe(true);
      });
      await vi.waitFor(() => {
        expect(screen.getByRole("button", { name: "제외" })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "제외" }));
      await vi.waitFor(() => {
        expect(calls.some((c) => c.method === "POST" && c.path === "/api/teacher/content/audio/d1/reject")).toBe(true);
      });
    } finally {
      window.removeEventListener("haeon:tts-usage-refresh", onUsageRefresh);
    }
  });

  it("disables missing audio cells as not ready when writable is true but ttsReady is false", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    view.ttsReady = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    renderTeacher("/teach/content");
    expect(await screen.findByRole("button", { name: "Charon 모자 단어 음원, 없음, 생성 준비 안 됨" })).toBeDisabled();
  });

  it("renders bottom release bar, opens inline confirmation with counts, and publishes a release", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    view.release = {
      latestSeq: 1,
      latestReleasedAt: "2026-11-19T10:00:00.000Z",
      latestNote: "초기",
      pendingReviewCount: 2,
      draftItemCount: 1,
      draftAudioCount: 1,
      staleAudioCount: 0,
      unpublishedApprovedCount: 3,
      nextItemCount: 326,
      nextAudioCount: 845,
    };
    const releasePosts: Array<{ note?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        if (method === "POST" && url.pathname === "/api/teacher/content/releases") {
          releasePosts.push(init?.body ? (JSON.parse(String(init.body)) as { note?: string }) : {});
          return new Response(
            JSON.stringify({
              release: { seq: 2, releasedAt: "2026-11-20T00:00:00.000Z", note: "1차 반영", itemCount: 326, audioCount: 845 },
              status: { ...view.release, latestSeq: 2, unpublishedApprovedCount: 0 },
            }),
            { status: 201 },
          );
        }
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    renderTeacher("/teach/content");
    const bar = await screen.findByRole("region", { name: "학습자에게 내보내기" });
    expect(bar).toHaveTextContent("검수 대기 2 · 승인했지만 아직 안 나간 것 3");
    expect(bar).toHaveTextContent("제1판");

    fireEvent.click(screen.getByRole("button", { name: "학습자에게 내보내기" }));
    expect(screen.getByText("단어 326개, 음원 845개가 학습자 화면에 반영돼요.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("내보내기 메모 (선택)"), { target: { value: "1차 반영" } });
    fireEvent.click(screen.getByRole("button", { name: "지금 내보내기" }));

    expect(await screen.findByText("제2판으로 내보냈어요.")).toBeInTheDocument();
    expect(releasePosts).toEqual([{ note: "1차 반영" }]);
  });

  it("never shows AI proposal text, counts, filters, or apply buttons even when the API returns a pending proposal", async () => {
    const view = makeContentView("j_ch_jj");
    view.writable = true;
    view.groups[0]!.proposalCount = 1;
    view.totalProposalCount = 1;
    const targetItem = view.stages[0]!.items[0]!;
    targetItem.gloss = "";
    targetItem.scene = "";
    targetItem.example = "";
    targetItem.proposal = {
      id: "prop-1",
      itemId: targetItem.id,
      kind: "fill",
      fields: { gloss: "맑은 공기를 마시며 천천히 걷는 일.", example: "주말 오후에 공원에서 가볍게 산책해요." },
      sense: "산책(散策)",
      flags: ["동음이의어 확인"],
      source: "ai_draft",
      model: "model-test",
      promptVersion: "fill-v1",
      status: "pending",
      createdAt: "2026-11-21T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://127.0.0.1:4174");
        if (url.pathname === "/api/me") return new Response(JSON.stringify({ error: "not_connected" }), { status: 401 });
        if (url.pathname === "/api/teacher/learners") return new Response(JSON.stringify(teacherView), { status: 200 });
        if (url.pathname === "/api/teacher/content/usage") return new Response(JSON.stringify(usageView), { status: 200 });
        if (url.pathname === "/api/teacher/content") return new Response(JSON.stringify(view), { status: 200 });
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }),
    );

    renderTeacher("/teach/content");
    expect(await screen.findByRole("button", { name: targetItem.word })).toBeInTheDocument();
    expect(screen.queryByText(/AI 제안/)).not.toBeInTheDocument();
    expect(screen.queryByText("맑은 공기를 마시며 천천히 걷는 일.")).not.toBeInTheDocument();
    expect(screen.queryByText("주말 오후에 공원에서 가볍게 산책해요.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "제안만 보기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: targetItem.word }));
    expect(screen.getByLabelText("쉬운 뜻")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "적용" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "버리기" })).not.toBeInTheDocument();
  });
});
