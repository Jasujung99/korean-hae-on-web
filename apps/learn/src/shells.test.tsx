// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { LearnRoutes } from "./App";
import type { LearnRuntime } from "./runtime";
import { Shell } from "./shell";

afterEach(() => cleanup());

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
  it("shows the listening shell without a score or a role switch", () => {
    renderAt("/", false);
    expect(screen.getByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소리 듣기 · 준비 중" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();
    expect(screen.queryByText(/정답|41분|\d+\s*\/\s*\d+/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /아자/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택 확인" }));
    expect(screen.getByRole("status").textContent).toContain("서버에도 저장하지 않습니다");
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

  it("keeps teacher observation behind the preview gate and shows no scores", () => {
    renderAt("/teach", false);
    expect(screen.getByRole("heading", { level: 2, name: "교사 인증 전" })).toBeInTheDocument();
    expect(screen.queryByText("배정된 학습자가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "개발 미리보기 역할" })).not.toBeInTheDocument();

    cleanup();
    renderAt("/teach", true);
    expect(screen.getByRole("group", { name: "개발 미리보기 역할" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "이번 학습 기록" })).toBeInTheDocument();
    expect(screen.getByText("배정된 학습자가 없습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("없음").length).toBeGreaterThan(0);
    expect(screen.queryByText(/정답|\d+분/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "학습자" }));
    expect(screen.getByRole("heading", { level: 2, name: /귀를 기울여요/ })).toBeInTheDocument();
  });
});
