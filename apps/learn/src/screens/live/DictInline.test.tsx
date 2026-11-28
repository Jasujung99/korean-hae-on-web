// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { WordDictView } from "../../../server/preview/contract.ts";

const tracked = vi.hoisted(() => [] as Array<{ type: string; payload: unknown }>);

vi.mock("../../preview/telemetry", () => ({
  track: (type: string, payload?: unknown) => {
    tracked.push({ type, payload });
  },
}));

// 학습자 설정 대신: 사전 언어를 화면 안에서 바꿀 수 있는 작은 상태.
vi.mock("../../preview/settings", async () => {
  const { useState } = await import("react");
  return {
    useLearner: () => {
      const [dictLanguage, setLanguage] = useState<"ru" | "en">("ru");
      return {
        dictLanguage,
        change: async (next: { dictLanguage?: "ru" | "en" }) => {
          if (next.dictLanguage) setLanguage(next.dictLanguage);
        },
      };
    },
  };
});

const { DictInline, dictShortcuts, krdictHref } = await import("./DictInline");

afterEach(() => {
  cleanup();
  tracked.length = 0;
});

// 한국어기초사전 69297(모자02)·표준국어대사전 425739(모자07) 응답에서 옮긴 시험용 값.
const approved: WordDictView = {
  status: "approved",
  krdict: {
    targetCode: 69297,
    pos: "명사",
    grade: "초급",
    definition: "예의를 차리거나 추위나 더위 등을 막기 위해 머리에 쓰는 물건.",
    example: "그는 자리에서 일어나 머리에 모자를 쓰더니 밖으로 나갔다.",
    translations: {
      ru: { word: "головной убор; шапка; шляпа", definition: "Элемент одежды, который надевается на голову." },
      en: { word: "hat", definition: "An object worn on the head in order to be polite or to keep out the cold or heat, etc." },
    },
  },
  stdict: {
    targetCode: 425739,
    origin: "帽子",
    pos: "명사",
    pronunciation: "모자",
    definition: "머리에 쓰는 물건의 하나. 예의를 차리거나 추위, 더위, 먼지 따위를 막기 위한 것이다.",
  },
};

function renderPanel(dict: WordDictView | null) {
  return render(
    <MemoryRouter>
      <DictInline word="모자" wordId="w-1871" pos="명" dict={dict} />
    </MemoryRouter>,
  );
}

function openPanel(dict: WordDictView | null) {
  renderPanel(dict);
  fireEvent.click(screen.getByRole("button", { name: /사전 풀이/ }));
}

describe("DictInline", () => {
  it("shows an approved entry without the review mark and records the open", () => {
    openPanel(approved);
    expect(screen.getByText(approved.krdict!.definition)).toBeInTheDocument();
    expect(screen.getByText(/명사 · 초급/)).toBeInTheDocument();
    expect(screen.queryByText(/검수 전/)).not.toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 2\.0 KR/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CC BY-SA 2.0 KR" })).not.toBeInTheDocument();
    expect(screen.queryByText(/크리에이티브 커먼즈 저작자표시-동일조건변경허락/)).not.toBeInTheDocument();
    expect(tracked).toEqual([{ type: "dictionary_opened", payload: { wordId: "w-1871", mode: "inline" } }]);
  });

  it("marks draft and needs_review entries as not yet reviewed", () => {
    openPanel({ ...approved, status: "draft" });
    expect(screen.getByRole("note")).toHaveTextContent("검수 전");
    cleanup();
    openPanel({ ...approved, status: "needs_review" });
    expect(screen.getByRole("note")).toHaveTextContent("개발 미리보기에서만");
  });

  it("switches the translation between Russian and English", () => {
    openPanel(approved);
    const group = screen.getByRole("group", { name: "내 언어 고르기" });
    expect(group.textContent).toBe("РусскийEnglish");
    expect(screen.getByText("головной убор; шапка; шляпа")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("hat")).toBeInTheDocument();
    expect(screen.queryByText("головной убор; шапка; шляпа")).not.toBeInTheDocument();
  });

  it("says so when a language has no translation", () => {
    openPanel({ ...approved, krdict: { ...approved.krdict!, translations: { ru: approved.krdict!.translations.ru, en: null } } });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("이 낱말은 아직 영어 풀이가 없어요.")).toBeInTheDocument();
  });

  it("shows only the basic dictionary and my language, without the standard dictionary text", () => {
    openPanel(approved);
    expect(screen.queryByText(approved.stdict!.definition)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /표준국어대사전 풀이/ })).not.toBeInTheDocument();
    expect(screen.queryByText("사전에서 더 보기")).not.toBeInTheDocument();
    const credit = screen.getByText(/출처 국립국어원 한국어기초사전 · 표준국어대사전 ·/);
    expect(credit).toHaveTextContent("출처 국립국어원 한국어기초사전 · 표준국어대사전 · CC BY-SA 2.0 KR");
    expect(within(credit).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("라이선스 전문 보기")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "라이선스 전문 보기" })).not.toBeInTheDocument();
  });

  it("shows a quiet empty state with only the Naver shortcut when there is no entry", () => {
    openPanel(null);
    expect(screen.getByText("이 낱말의 사전 풀이는 아직 준비하고 있어요.")).toBeInTheDocument();
    expect(screen.queryByText(/검수 전/)).not.toBeInTheDocument();
    expect(screen.queryByText(/출처:/)).not.toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["네이버 사전 새 창으로 열기"]);
  });

  it("puts the standard dictionary and Naver shortcuts in the header and the basic dictionary link on its label", () => {
    renderPanel(approved);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /사전 풀이/ }));
    const stdict = screen.getByRole("link", { name: "표준국어대사전 새 창으로 열기" });
    const naver = screen.getByRole("link", { name: "네이버 사전 새 창으로 열기" });
    const krdict = screen.getByRole("link", { name: "한국어기초사전 새 창으로 열기" });
    expect(stdict).toHaveTextContent("표준국어대사전 ↗");
    expect(naver).toHaveTextContent("네이버 사전 ↗");
    expect(krdict).toHaveTextContent("한국어기초사전 ↗");
    const head = stdict.closest(".dict-inline-head");
    expect(head).not.toBeNull();
    expect(head).toContainElement(naver);
    expect(head).not.toContainElement(krdict);
    expect(krdict).toHaveAttribute("href", "https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=69297");
    expect(stdict).toHaveAttribute("href", "https://stdict.korean.go.kr/search/searchView.do?word_no=425739&searchKeywordTo=3");
    expect(naver).toHaveAttribute("href", `https://ko.dict.naver.com/#/search?query=${encodeURIComponent("모자")}`);
    // 사전 바깥 링크는 모두 새 창으로 연다. 라이선스 표기(CC BY-SA 2.0 KR)는 글자만이라 링크가 아니다.
    const outside = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("https://"));
    expect(screen.getAllByRole("link")).toHaveLength(outside.length);
    expect(outside).toHaveLength(4); // 표준국어대사전·네이버·한국어기초사전·대역어 뒤 ↗
    for (const link of outside) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
    }
    tracked.length = 0;
    fireEvent.click(stdict);
    fireEvent.click(krdict);
    expect(tracked).toEqual([
      { type: "dictionary_link_opened", payload: { wordId: "w-1871", target: "stdict" } },
      { type: "dictionary_link_opened", payload: { wordId: "w-1871", target: "krdict" } },
    ]);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("links the translated word to the basic dictionary in the chosen language", () => {
    openPanel(approved);
    const group = screen.getByRole("group", { name: "내 언어 고르기" });
    expect(within(group).queryAllByRole("link")).toHaveLength(0);
    const ru = screen.getByRole("link", { name: "한국어기초사전 러시아어 화면 새 창으로 열기" });
    expect(ru).toHaveTextContent("↗");
    expect(ru.closest("p")).toHaveTextContent("головной убор; шапка; шляпа");
    expect(ru).toHaveAttribute("href", "https://krdict.korean.go.kr/rus/dicSearch/SearchView?ParaWordNo=69297&nation=rus&nationCode=5");
    expect(ru).toHaveAttribute("target", "_blank");
    expect(ru).toHaveAttribute("rel", "noopener");
    tracked.length = 0;
    fireEvent.click(ru);
    expect(tracked).toEqual([{ type: "dictionary_link_opened", payload: { wordId: "w-1871", target: "krdict", lang: "ru" } }]);
    expect(screen.getByRole("button", { name: "Русский" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    const en = screen.getByRole("link", { name: "한국어기초사전 영어 화면 새 창으로 열기" });
    expect(en).toHaveAttribute("href", "https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=69297&nation=eng&nationCode=6");
    expect(screen.queryByRole("link", { name: /러시아어 화면/ })).not.toBeInTheDocument();
  });

  it("builds shortcuts only for dictionaries that have an entry number", () => {
    expect(dictShortcuts("김치찌개", { ...approved, stdict: null }).map((link) => link.target)).toEqual(["naver"]);
    expect(dictShortcuts("모자", approved).map((link) => link.target)).toEqual(["stdict", "naver"]);
    expect(dictShortcuts("김치찌개", null)[0]?.href).toBe("https://ko.dict.naver.com/#/search?query=%EA%B9%80%EC%B9%98%EC%B0%8C%EA%B0%9C");
    expect(krdictHref(69297)).toBe("https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=69297");
  });
});
