// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { WordDictView } from "../../../server/preview/contract.ts";

const tracked = vi.hoisted(() => [] as Array<{ type: string; payload: unknown }>);
const changes = vi.hoisted(() => [] as Array<unknown>);

vi.mock("../../preview/telemetry", () => ({
  track: (type: string, payload?: unknown) => {
    tracked.push({ type, payload });
  },
}));

vi.mock("../../preview/settings", async () => {
  const { useState } = await import("react");
  return {
    useLearner: () => {
      const [dictLanguage, setLanguage] = useState<"ru" | "en">("ru");
      return {
        dictLanguage,
        change: async (next: { dictLanguage?: "ru" | "en" }) => {
          changes.push(next);
          if (next.dictLanguage) setLanguage(next.dictLanguage);
        },
      };
    },
  };
});

const { DictTabs } = await import("./DictTabs");

afterEach(() => {
  cleanup();
  tracked.length = 0;
  changes.length = 0;
});

// content/dict/entries.json의 기차 항목(한국어기초사전 60632 · 표준국어대사전 402860)에서 옮긴 값.
const gicha: WordDictView = {
  status: "draft",
  krdict: {
    targetCode: 60632,
    pos: "명사",
    grade: "초급",
    definition: "사람이나 물건을 싣고 연료의 힘으로 철도 위를 달리는, 길이가 긴 차.",
    example: "폭설로 인해 서울행 기차가 연착되었다는 안내 방송이 나왔다.",
    translations: {
      ru: { word: "поезд", definition: "Перевозящий людей или груз вагонный состав, который работает на топливе и передвигается по рельсам." },
      en: { word: "train", definition: "A lengthy series of vehicles that carry people or goods and run on a railroad, usually by the power of diesel fuel or electric power." },
    },
  },
  stdict: { targetCode: 402860, origin: "汽車", pos: "명사", pronunciation: "기차", definition: "기관차에 여객차나 화물차를 연결하여 궤도 위를 운행하는 차량. 사람이나 화물을 실어 나른다." },
};

function openTabs(dict: WordDictView | null) {
  render(
    <MemoryRouter>
      <DictTabs word="기차" wordId="w-807" pos="명" dict={dict} />
    </MemoryRouter>,
  );
  const toggle = screen.getByRole("button", { name: /사전 풀이/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
}

describe("DictTabs", () => {
  it("opens on the basic dictionary tab with the part of speech beside the headword", () => {
    openTabs(gicha);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["한국어기초사전", "Русский", "English"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0]!.id);
    const pos = within(panel).getByText("명사");
    expect(pos).toHaveClass("dict-tabs-pos");
    expect(pos.closest("p")).toHaveTextContent(/^기차명사초급$/);
    expect(within(panel).getByText(gicha.krdict!.definition)).toBeInTheDocument();
    expect(within(panel).getByText(gicha.krdict!.example!)).toBeInTheDocument();
    expect(tracked).toEqual([{ type: "dictionary_opened", payload: { wordId: "w-807", mode: "inline" } }]);
  });

  it("takes the part of speech from the dictionary entry, not the short word-list tag", () => {
    openTabs({ ...gicha, krdict: { ...gicha.krdict!, pos: "의존 명사" } });
    expect(screen.getByText("의존 명사")).toHaveClass("dict-tabs-pos");
    expect(screen.queryByText("명")).not.toBeInTheDocument();
  });

  it("has no review notice even for a draft entry", () => {
    openTabs(gicha);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/검수 전/)).not.toBeInTheDocument();
  });

  it("labels the language panels only with the language name and saves the choice", () => {
    openTabs(gicha);
    fireEvent.click(screen.getByRole("tab", { name: "English" }));
    let panel = screen.getByRole("tabpanel");
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveAttribute("lang", "en");
    expect(within(panel).getByText("영어 풀이")).toBeInTheDocument();
    expect(panel).toHaveTextContent(/^train영어 풀이A lengthy series/);
    expect(panel).not.toHaveTextContent("·");
    expect(panel).not.toHaveTextContent("한국어기초사전");
    expect(changes).toEqual([{ dictLanguage: "en" }]);

    fireEvent.click(screen.getByRole("tab", { name: "Русский" }));
    panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("러시아어 풀이")).toBeInTheDocument();
    expect(within(panel).getByText("поезд")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("·");
    expect(screen.queryByText(gicha.krdict!.definition)).not.toBeInTheDocument();
  });

  it("moves between tabs with the arrow, Home and End keys", () => {
    openTabs(gicha);
    const first = screen.getByRole("tab", { name: "한국어기초사전" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Русский" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Русский" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("tab", { name: "한국어기초사전" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tab", { name: "English" })).toHaveFocus();
  });

  it("puts the dictionary links and the source under the panel, following the chosen language", () => {
    openTabs(gicha);
    const links = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("https://"));
    expect(links.map((link) => link.textContent)).toEqual(["한국어기초사전 ↗", "표준국어대사전 ↗", "네이버 사전 ↗"]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
      expect(link.closest(".dict-tabs-links")).not.toBeNull();
    }
    expect(links[0]).toHaveAttribute("href", "https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=60632");
    expect(links[1]).toHaveAttribute("href", "https://stdict.korean.go.kr/search/searchView.do?word_no=402860&searchKeywordTo=3");
    expect(screen.getByText(/출처 국립국어원 한국어기초사전 · 표준국어대사전 ·/)).toHaveTextContent("CC BY-SA 2.0 KR");
    expect(screen.queryByRole("link", { name: "CC BY-SA 2.0 KR" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Русский" }));
    const ru = screen.getByRole("link", { name: "한국어기초사전 러시아어 화면 새 창으로 열기" });
    expect(ru).toHaveAttribute("href", "https://krdict.korean.go.kr/rus/dicSearch/SearchView?ParaWordNo=60632&nation=rus&nationCode=5");
    tracked.length = 0;
    fireEvent.click(ru);
    expect(tracked).toEqual([{ type: "dictionary_link_opened", payload: { wordId: "w-807", target: "krdict", lang: "ru" } }]);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("says so when a language has no translation", () => {
    openTabs({ ...gicha, krdict: { ...gicha.krdict!, translations: { ru: gicha.krdict!.translations.ru, en: null } } });
    fireEvent.click(screen.getByRole("tab", { name: "English" }));
    expect(screen.getByText("이 낱말은 아직 영어 풀이가 없어요.")).toBeInTheDocument();
  });

  it("shows a quiet empty state with only the Naver shortcut when there is no entry", () => {
    openTabs(null);
    expect(screen.getByText("이 낱말의 사전 풀이는 아직 준비하고 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(["네이버 사전 새 창으로 열기"]);
  });
});
