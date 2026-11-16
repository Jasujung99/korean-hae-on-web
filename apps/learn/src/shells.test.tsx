// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { LearnRoutes } from "./App";
import { peekInviteToken, resetInviteTokenMemory } from "./join-token";
import type { LearnRuntime } from "./runtime";
import { Shell } from "./shell";

afterEach(() => {
  cleanup();
  resetInviteTokenMemory();
  window.history.replaceState(null, "", "/");
});

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

  it("shows the draft first-twelve words only in the dev preview", () => {
    renderAt("/practice", true);
    expect(screen.getByRole("heading", { level: 3, name: "초안 후보" })).toBeInTheDocument();
    expect(screen.getByText("초안 · 미검수")).toBeInTheDocument();
    expect(screen.getByText("모자")).toBeInTheDocument();
    expect(screen.getByText("바지")).toBeInTheDocument();
    expect(screen.getByText("여쭈다")).toBeInTheDocument();
    expect(screen.getByText(/연결 확인 필요/)).toBeInTheDocument();
    expect(screen.queryByText("감자")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 확인" })).toBeDisabled();
    expect(screen.queryByText(/정답/)).not.toBeInTheDocument();
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

  it("keeps teacher observation behind the preview gate and shows an empty confusion table", () => {
    renderAt("/teach", false);
    expect(screen.getByRole("heading", { level: 2, name: "교사 인증 전" })).toBeInTheDocument();
    expect(screen.queryByText("배정된 학습자가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();

    cleanup();
    renderAt("/teach/detail", true);
    expect(screen.getByRole("group", { name: "개발 미리보기 역할" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "모음 맥락" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell")).toHaveLength(9);
    expect(screen.getByText(/더해서 총시간으로 보이지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/정답|\d+분/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "학습자" }));
    expect(screen.getByRole("heading", { level: 2, name: "연결된 연습이 없습니다." })).toBeInTheDocument();
  });
});
