import { describe, expect, it } from "vitest";
import { parseKrdictSearch, parseStdictSearch, parseStdictView, pickKrdict, pickStdict, redact, similarity, type KrItem, type StCandidate } from "./fetch-lib.ts";

// 실제 응답 모양을 줄인 것(한국어기초사전 /api/search, 표준국어대사전 /standard/api/view.do).
const krSearch = `<?xml version="1.0" encoding="UTF-8"?>
<channel><total>3</total>
<item><target_code>69297</target_code><word>모자</word><sup_no>2</sup_no><origin>帽子</origin><pronunciation>모자</pronunciation><word_grade>초급</word_grade><pos>명사</pos>
<sense><sense_order>1</sense_order><definition>예의를 차리거나 추위나 더위 등을 막기 위해 머리에 쓰는 물건.</definition>
<translation><trans_lang>
 영어 </trans_lang><trans_word><![CDATA[hat]]></trans_word><trans_dfn><![CDATA[An object worn on the head.]]></trans_dfn></translation>
<translation><trans_lang> 러시아어 </trans_lang><trans_word><![CDATA[шапка]]></trans_word><trans_dfn><![CDATA[Головной убор.]]></trans_dfn></translation></sense></item>
<item><target_code>55580</target_code><word>모자</word><sup_no>1</sup_no><origin>母子</origin><pronunciation>모ː자</pronunciation><word_grade>중급</word_grade><pos>명사</pos>
<sense><sense_order>1</sense_order><definition>어머니와 아들.</definition>
<translation><trans_lang>러시아어</trans_lang><trans_word><![CDATA[]]></trans_word><trans_dfn><![CDATA[Мать и сын.]]></trans_dfn></translation></sense></item>
<item><target_code>46143</target_code><word>모자라다</word><sup_no>0</sup_no><pos>동사</pos><sense><sense_order>1</sense_order><definition>정해진 수에 이르지 못하다.</definition></sense></item>
</channel>`;

const stView = `<channel><total>1</total><item><target_code>425739</target_code><word_info><word><![CDATA[모자]]></word>
<original_language_info><original_language><![CDATA[帽子]]></original_language><language_type>한자</language_type></original_language_info>
<pronunciation_info><pronunciation><![CDATA[모자]]></pronunciation></pronunciation_info>
<pos_info><pos>명사</pos><comm_pattern_info><sense_info><definition><![CDATA[머리에 쓰는 물건의 하나.]]></definition>
<example_info><example><![CDATA[제복을 입고 모자를 쓴 군인.]]></example></example_info>
<example_info><example><![CDATA[하얀 모자 아래로 머리카락이 날린다.]]></example><source><![CDATA[최인훈, 구운몽]]></source></example_info>
</sense_info></comm_pattern_info></pos_info></word_info></item></channel>`;

describe("dictionary fetch helpers", () => {
  it("reads krdict search results for the exact headword with ru/en translations", () => {
    const { error, items } = parseKrdictSearch(krSearch, "모자");
    expect(error).toBeNull();
    expect(items.map((item) => item.target_code)).toEqual([69297, 55580]);
    expect(items[0]?.senses[0]?.translations).toEqual({
      en: { word: "hat", definition: "An object worn on the head." },
      ru: { word: "шапка", definition: "Головной убор." },
    });
    expect(items[1]?.senses[0]?.translations.ru).toEqual({ word: "", definition: "Мать и сын." });
    expect(items[1]?.senses[0]?.translations.en).toBeNull();
  });

  it("reports API errors instead of items", () => {
    expect(parseKrdictSearch("<error><error_code>020</error_code><message>Unregistered key</message></error>", "모자").error).toEqual({
      code: "020",
      message: "Unregistered key",
    });
    expect(parseStdictSearch('{"error":{"error_code":20,"message":"Unregistered key "}}', "모자").error?.code).toBe("20");
    expect(parseStdictSearch("", "모자")).toEqual({ error: null, items: [] });
  });

  it("keeps the source of each stdict example so sourced ones can be dropped", () => {
    const { view } = parseStdictView(stView);
    expect(view?.origin).toBe("帽子");
    expect(view?.senses[0]?.examples).toEqual([
      { text: "제복을 입고 모자를 쓴 군인.", source: "" },
      { text: "하얀 모자 아래로 머리카락이 날린다.", source: "최인훈, 구운몽" },
    ]);
  });

  it("picks the homograph whose meaning matches our gloss", () => {
    const { items } = parseKrdictSearch(krSearch, "모자");
    const pick = pickKrdict({ word: "모자", pos: "명", gloss: "머리에 쓰는 물건." }, items);
    expect(pick.chosen?.item.target_code).toBe(69297);
    expect(pick.confident).toBe(true);
    expect(similarity("머리에 쓰는 물건.", "어머니와 아들.")).toBe(0);
  });

  it("does not claim confidence when our table has no gloss", () => {
    const { items } = parseKrdictSearch(krSearch, "모자");
    const pick = pickKrdict({ word: "모자", pos: "", gloss: "" }, items);
    expect(pick.confident).toBe(false);
    expect(pick.reason).toContain("뜻이 없어");
  });

  it("hides key values in log lines", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    expect(redact(`GET https://x/api?key=${secret}&q=1 failed (${secret})`, [secret])).toBe("GET https://x/api?key=[redacted]&q=1 failed ([redacted])");
  });

  const saltItem = (): KrItem => ({
    target_code: 61167,
    word: "소금",
    sup_no: 0,
    origin: "",
    pronunciation: "소금",
    grade: "초급",
    pos: "명사",
    senses: [
      { order: 1, definition: "짠맛을 내는 하얀 가루.", translations: { ru: null, en: null } },
      { order: 2, definition: "(비유적으로) 꼭 필요한 사람.", translations: { ru: null, en: null } },
    ],
  });

  const saltStdict = (): StCandidate => ({
    item: { target_code: 444906, word: "소금", sup_no: 1, pos: "명사", origin: "", definition: "짠맛이 나는 백색의 결정체." },
    view: {
      target_code: 444906,
      word: "소금",
      origin: "",
      pronunciation: "소금",
      senses: [
        { pos: "명사", definition: "짠맛이 나는 백색의 결정체. 대표적인 조미료로, 주성분은 염화 나트륨이다.", examples: [] },
        { pos: "명사", definition: "물건이 썩는 것을 막고 음식의 맛을 나게 한다는 점에서 사회도덕을 순화·향상시키는 참신자의 사명을 비유적으로 이르는 말.", examples: [] },
      ],
    },
  });

  it("uses a reviewer-pinned sense even when another sense of the same entry scores higher", () => {
    const item = saltItem();
    const auto = pickKrdict({ word: "소금", pos: "명", gloss: "바닷물 등에서 얻으며 음식의 짠맛을 맞추는 데 쓰는 하얀 가루." }, [item]);
    expect(auto.chosen?.senseIndex).toBe(0);
    const pinned = pickKrdict({ word: "소금", pos: "명", gloss: "바닷물 등에서 얻으며 음식의 짠맛을 맞추는 데 쓰는 하얀 가루." }, [item], { code: 61167, sense: 2 });
    expect(pinned.confident).toBe(true);
    expect(pinned.chosen?.item.target_code).toBe(61167);
    expect(pinned.chosen?.senseIndex).toBe(1);
    expect(pinned.reason).toContain("2번째 뜻");
    const byCodeOnly = pickKrdict({ word: "소금", pos: "명", gloss: "바닷물 등에서 얻으며 음식의 짠맛을 맞추는 데 쓰는 하얀 가루." }, [item], 61167);
    expect(byCodeOnly.confident).toBe(true);
    expect(byCodeOnly.chosen?.senseIndex).toBe(0);
    expect(byCodeOnly.reason).toContain("번호(61167)를 썼어요");
  });

  it("does not stay confident when the pinned sense number is out of range", () => {
    const pick = pickKrdict({ word: "소금", pos: "명", gloss: "짠맛을 내는 하얀 가루." }, [saltItem()], { code: 61167, sense: 9 });
    expect(pick.confident).toBe(false);
    expect(pick.chosen).toBeNull();
    expect(pick.reason).toContain("9번째 뜻이 없어요");
  });

  it("uses a reviewer-pinned stdict sense of the same entry", () => {
    const input = { word: "소금", pos: "명", gloss: "바닷물 등에서 얻으며 음식의 짠맛을 맞추는 데 쓰는 하얀 가루." };
    const auto = pickStdict(input, [saltStdict()], null);
    expect(auto.chosen?.senseIndex).toBe(1);
    const pinned = pickStdict(input, [saltStdict()], null, { code: 444906, sense: 1 });
    expect(pinned.confident).toBe(true);
    expect(pinned.chosen?.candidate.item.target_code).toBe(444906);
    expect(pinned.chosen?.senseIndex).toBe(0);
    expect(pinned.reason).toContain("1번째 뜻");
    const missing = pickStdict(input, [saltStdict()], null, { code: 444906, sense: 5 });
    expect(missing.confident).toBe(false);
    expect(missing.chosen).toBeNull();
    expect(missing.reason).toContain("5번째 뜻이 없어요");
  });
});
