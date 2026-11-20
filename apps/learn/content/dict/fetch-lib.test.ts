import { describe, expect, it } from "vitest";
import { parseKrdictSearch, parseStdictSearch, parseStdictView, pickKrdict, redact, similarity } from "./fetch-lib.ts";

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
});
