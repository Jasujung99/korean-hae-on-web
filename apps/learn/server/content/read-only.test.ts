import { describe, expect, it } from "vitest";
import { createTestAccounts } from "../accounts/test-kit.ts";
import { createFixtureAudio } from "../preview/audio.ts";
import type { TeacherContentView, TtsUsageView } from "../preview/contract.ts";

const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

describe("read-only teacher content API (stage 1)", () => {
  it("requires teacher auth for content and usage endpoints", async () => {
    const kit = await createTestAccounts({ audio: createFixtureAudio({}) });
    const learner = await kit.addConnectedLearner("학생");
    expect((await kit.client(null).request("/api/teacher/content")).status).toBe(401);
    expect((await learner.app.request("/api/teacher/content")).status).toBe(401);
    expect((await kit.client(null).request("/api/teacher/content/usage")).status).toBe(401);
    expect((await learner.app.request("/api/teacher/content/usage")).status).toBe(401);
  });

  it("returns all five groups with counts, stages, stage0, and audio states", async () => {
    const audio = createFixtureAudio({
      "word-1871-모자--erinome": wav,
      "sentence-1871-모자--sulafat": wav,
      "sentence-1871-모자--sulafat--turns": wav,
      "pw-아자--charon": wav,
      "word-3084-시간--erinome": wav,
    });
    const kit = await createTestAccounts({ audio });

    expect((await kit.teacher.request("/api/teacher/content?group=unknown")).status).toBe(400);

    const jcjRes = await kit.teacher.request("/api/teacher/content?group=j_ch_jj");
    expect(jcjRes.status).toBe(200);
    const jcj = (await jcjRes.json()) as TeacherContentView;
    expect(jcj.writable).toBe(false);
    expect(jcj.groups.map((g) => [g.id, g.count])).toEqual([
      ["j_ch_jj", 103],
      ["s_ss", 42],
      ["g_k_kk", 61],
      ["b_p_pp", 59],
      ["d_t_tt", 60],
    ]);
    expect(jcj.stages.map((s) => s.key)).toEqual(["Stage 1-A", "Stage 1-B", "Stage 2", "Stage 3", "Stage 4", "Stage 5"]);
    const moja = jcj.stages[0]?.items.find((item) => item.word === "모자");
    expect(moja?.wordAudio.erinome?.state).toBe("approved");
    expect(moja?.wordAudio.erinome?.playUrl).toMatch(/^\/api\/sound\//);
    expect(moja?.wordAudio.sulafat?.state).toBe("missing");
    expect(moja?.exampleAudio?.sulafat?.state).toBe("approved");
    expect(moja?.turnsAudio?.sulafat?.ready).toBe(true);
    expect(jcj.stage0.find((row) => row.stimulus === "아자")?.audio.charon?.state).toBe("approved");

    const sssRes = await kit.teacher.request("/api/teacher/content?group=s_ss");
    expect(sssRes.status).toBe(200);
    const sss = (await sssRes.json()) as TeacherContentView;
    expect(sss.stages.map((s) => s.key)).toEqual(["Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"]);
    expect(sss.stage0.find((row) => row.stimulus === "시간")?.audio.erinome?.state).toBe("approved");

    const usage = (await (await kit.teacher.request("/api/teacher/content/usage")).json()) as TtsUsageView;
    expect(usage.limit).toBe(100);
    expect(usage.used).toBe(0);
  });
});
