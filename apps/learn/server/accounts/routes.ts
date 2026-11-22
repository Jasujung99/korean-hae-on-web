// 개인 초대·기기 세션·교사 API. 문서: docs/adult-phoneme-app/02-invitation-and-device-session.md
// - 초대 링크를 여는 것(GET)이나 확인(inspect)으로는 초대를 소비하지 않는다. '이 기기에서 시작하기'(claim)만 소비한다.
// - 학습자는 HttpOnly 기기 쿠키로, 교사는 HttpOnly 교사 쿠키로 서버가 정한다. 화면이 보낸 id를 권한 근거로 쓰지 않는다.
// - 토큰 원문은 저장하거나 기록하지 않는다. 초대 원문은 발급 응답에서 한 번만 돌려준다.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { FLASH_TTS_MODEL, FLAT_READING_STYLE } from "../../content/tts/pipeline.ts";
import { DEFAULT_PRACTICE_VOICE, PRACTICE_VOICES, isPracticeVoiceKey, voicedAudioId } from "../../content/practice-voices.ts";
import { PRACTICE_ITEMS } from "../../content/practice.ts";
import { snapshotFromReferenceJson, type ContentSnapshot } from "../../content/snapshot.ts";
import { AUDITION_TEXT, AUDITION_VOICES, auditionAudioId, flatAuditionAudioId } from "../../content/voices.ts";
import type { AudioObjectStore } from "../content/audio-store.ts";
import type { ContentRepo } from "../content/repo.ts";
import { createContentRoutes } from "../content/routes.ts";
import { createAssetsInventoryAudio, createSnapshotAudio, createSnapshotCache, type SnapshotCache } from "../content/runtime.ts";
import { isMissingContentTableError } from "../content/supabase-repo.ts";
import { audioPicker, createPracticeRoutes, readJson, serveAudio, type LearnVars } from "../learn/practice.ts";
import type { PreviewAudio } from "../preview/audio.ts";
import type {
  InviteInspectView,
  InviteIssued,
  InviteStatus,
  LearnerSettings,
  MeView,
  PracticeVoiceView,
  TeacherLearnerRow,
  TeacherView,
  VoicesView,
} from "../preview/contract.ts";
import { exampleDetail, EXAMPLE_LEARNER } from "../preview/example.ts";
import { buildInventory } from "../preview/inventory.ts";
import { detail, summarize } from "../preview/observe.ts";
import { createAttemptLimiter, deviceTokenFor, makeHasher, randomToken, type TeacherAuth } from "./auth.ts";
import { createEventCache } from "./events.ts";
import { isLive, type AccountsRepo, type InvitationRow, type LearnerRow } from "./repo.ts";

export const DEVICE_COOKIE = "learn_device";
export const TEACHER_COOKIE = "learn_teacher";
const INVITE_TTL_MS = 72 * 60 * 60_000;
const DEVICE_TTL_MS = 30 * 24 * 60 * 60_000;
const TEACHER_TTL_MS = 12 * 60 * 60_000;
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
const CLAIM_KEY = /^[A-Za-z0-9-]{16,64}$/;
const LANGUAGE_LABEL = { ru: "러시아어" } as const;
const DICT_LABEL = { ru: "Русский", en: "English" } as const;

export type AccountsDeps = {
  repo: AccountsRepo;
  auth: TeacherAuth;
  sessionSecret: string;
  audio: PreviewAudio;
  /** 초대 링크에 쓰는 주소. 비우면 요청이 들어온 주소를 쓴다. */
  inviteOrigin: string | null;
  /** https 주소에서만 쿠키에 Secure를 붙인다(로컬·같은 와이파이 HTTP 시험용). */
  secureCookies: boolean;
  /** 개발 미리보기: 검수 전 사전 풀이도 '검수 전' 표시와 함께 보낸다. 운영에서는 끈다. */
  dictReview?: boolean;
  /** 단건 TTS 생성 키. 비어 있으면 생성 준비 안 됨 상태 */
  ttsApiKey?: string | null;
  contentRepo?: ContentRepo;
  audioStore?: AudioObjectStore;
  snapshotCache?: SnapshotCache;
  ttsFetcher?: typeof fetch;
  now?: () => Date;
};

type TeacherVars = { Variables: { teacherId: string } };

function inviteStatus(row: InvitationRow | undefined, now: Date): InviteStatus {
  if (!row) return "none";
  if (row.consumedAt) return "used";
  if (row.revokedAt) return "revoked";
  if (Date.parse(row.expiresAt) <= now.getTime()) return "expired";
  return "open";
}

function settingsOf(learner: LearnerRow): LearnerSettings {
  return {
    style: learner.uiStyle,
    items: learner.itemKind,
    dictLanguage: learner.dictLanguage,
    practiceVoice: isPracticeVoiceKey(learner.practiceVoice) ? learner.practiceVoice : DEFAULT_PRACTICE_VOICE,
    exampleReading: learner.exampleReading === "turns" ? "turns" : "spoken",
  };
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : "기기";
  const app = /KAKAOTALK/i.test(ua)
    ? "카카오톡"
    : /Line\//i.test(ua)
      ? "LINE"
      : /Telegram/i.test(ua)
        ? "Telegram"
        : /SamsungBrowser/i.test(ua)
          ? "Samsung Internet"
          : /Edg\//i.test(ua)
            ? "Edge"
            : /CriOS|Chrome/i.test(ua)
              ? "Chrome"
              : /Safari/i.test(ua)
                ? "Safari"
                : "브라우저";
  return `${os} · ${app}`;
}

export function createAccountRoutes(deps: AccountsDeps) {
  const { repo, auth, audio } = deps;
  const now = deps.now ?? (() => new Date());
  const hash = makeHasher(deps.sessionSecret);
  const cache = createEventCache(repo);
  const limitLogin = createAttemptLimiter();
  const snapshotCache = deps.contentRepo ? (deps.snapshotCache ?? createSnapshotCache(deps.contentRepo)) : null;
  let refFallback: ContentSnapshot | null = null;
  const resolveContent = async (): Promise<{ snapshot: ContentSnapshot; audio: PreviewAudio }> => {
    if (snapshotCache) {
      const { snapshot, fromRelease } = await snapshotCache.get();
      if (fromRelease && deps.audioStore) {
        return { snapshot, audio: createSnapshotAudio(snapshot, deps.sessionSecret, deps.audioStore) };
      }
      return { snapshot, audio };
    }
    if (!refFallback) refFallback = snapshotFromReferenceJson();
    return { snapshot: refFallback, audio };
  };
  const app = new Hono();

  const cookieOptions = (maxAgeMs: number) => ({
    httpOnly: true,
    secure: deps.secureCookies,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });

  async function currentLearner(c: Context): Promise<{ learner: LearnerRow; sessionId: string } | null> {
    const token = getCookie(c, DEVICE_COOKIE);
    if (!token || !TOKEN.test(token)) return null;
    const session = await repo.deviceSession(hash("device", token));
    if (!session || !isLive(session, now())) return null;
    const learner = await repo.learner(session.ownerId);
    if (!learner || learner.status !== "active") {
      // 종료했거나 지운 학습자의 기기: 로그인 안 된 것과 같게 보고 쿠키도 지운다.
      deleteCookie(c, DEVICE_COOKIE, { path: "/", secure: deps.secureCookies });
      return null;
    }
    return { learner, sessionId: session.id };
  }

  async function currentTeacher(c: Context): Promise<string | null> {
    const token = getCookie(c, TEACHER_COOKIE);
    if (!token || !TOKEN.test(token)) return null;
    const session = await repo.teacherSession(hash("teacher", token));
    if (!session || !isLive(session, now())) return null;
    return (await repo.teacher(session.ownerId)) ? session.ownerId : null;
  }

  const requireLearner: MiddlewareHandler<LearnVars> = async (c, next) => {
    const found = await currentLearner(c);
    if (!found) return c.json({ error: "not_connected" }, 401);
    c.set("learner", found.learner);
    c.set("store", await cache.forLearner(found.learner.id));
    await next();
  };

  const requireTeacher: MiddlewareHandler<TeacherVars> = async (c, next) => {
    const teacherId = await currentTeacher(c);
    if (!teacherId) return c.json({ error: "teacher_login_required" }, 401);
    c.set("teacherId", teacherId);
    await next();
  };

  /** 이 교사에게 배정된 학습자만 찾는다. 종료한 학습자도 찾는다(기록 보기·다시 열기·삭제). */
  async function ownLearner(teacherId: string, id: string): Promise<LearnerRow | null> {
    const learner = await repo.learner(id);
    return learner && learner.teacherId === teacherId ? learner : null;
  }

  const practiceVoicesView = (resolvedAudio: PreviewAudio): PracticeVoiceView[] =>
    PRACTICE_VOICES.map((row) => ({
      key: row.key,
      voice: row.voice,
      label: row.label,
      note: row.note,
      ready: PRACTICE_ITEMS.filter((item) => resolvedAudio.refFor(voicedAudioId(item.audioId, row.key))).length,
      total: PRACTICE_ITEMS.length,
      sampleRef: resolvedAudio.refFor(voicedAudioId(PRACTICE_ITEMS[0]?.audioId ?? "", row.key)),
    }));

  const meView = async (learner: LearnerRow): Promise<MeView> => {
    const { audio: resolvedAudio } = await resolveContent();
    return {
      learner: { id: learner.id, nickname: learner.nickname },
      settings: settingsOf(learner),
      practiceVoices: practiceVoicesView(resolvedAudio),
    };
  };

  // ── 첫 연결 ──────────────────────────────────────────────
  app.post("/invitations/inspect", async (c) => {
    const body = await readJson(c);
    const token = body?.token;
    if (typeof token !== "string" || !TOKEN.test(token)) {
      return c.json<InviteInspectView>({ status: "invalid", nickname: null, dictLanguage: null });
    }
    const invitation = await repo.invitationByHash(hash("invite", token));
    const status = inviteStatus(invitation ?? undefined, now());
    if (!invitation || status !== "open") {
      const shown = status === "none" || status === "open" ? "invalid" : status;
      return c.json<InviteInspectView>({ status: shown, nickname: null, dictLanguage: null });
    }
    const learner = await repo.learner(invitation.learnerId);
    if (!learner || learner.status !== "active") {
      return c.json<InviteInspectView>({ status: "invalid", nickname: null, dictLanguage: null });
    }
    return c.json<InviteInspectView>({ status: "ok", nickname: learner.nickname, dictLanguage: learner.dictLanguage });
  });

  app.post("/invitations/claim", async (c) => {
    const body = await readJson(c);
    const token = body?.token;
    const claimKey = body?.claimKey;
    if (typeof token !== "string" || !TOKEN.test(token) || typeof claimKey !== "string" || !CLAIM_KEY.test(claimKey)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const inviteHash = hash("invite", token);
    const deviceToken = deviceTokenFor(deps.sessionSecret, inviteHash, claimKey);
    const result = await repo.claim({
      tokenHash: inviteHash,
      claimKeyHash: hash("claim", claimKey),
      sessionHash: hash("device", deviceToken),
      sessionExpiresAt: new Date(now().getTime() + DEVICE_TTL_MS).toISOString(),
      deviceLabel: deviceLabel(c.req.header("user-agent")),
    });
    if ((result.status !== "claimed" && result.status !== "replayed") || !result.learnerId) {
      return c.json({ error: "invite_unavailable", status: result.status }, 410);
    }
    let learner = await repo.learner(result.learnerId);
    if (!learner || learner.status !== "active") {
      // 종료와 거의 같은 때에 들어온 연결: 방금 만든 기기 세션도 끊는다.
      if (learner) await repo.revokeLearnerDevices(learner.id);
      return c.json({ error: "invite_unavailable", status: "invalid" }, 410);
    }
    if (body?.dictLanguage === "ru" || body?.dictLanguage === "en") {
      learner = (await repo.updateLearner(learner.id, { dictLanguage: body.dictLanguage })) ?? learner;
    }
    // 이 브라우저에 다른 학습자가 연결돼 있었다면 그 기기 세션은 끝낸다(한 브라우저에 한 학습자).
    const previous = getCookie(c, DEVICE_COOKIE);
    if (previous && TOKEN.test(previous) && previous !== deviceToken) {
      const old = await repo.deviceSession(hash("device", previous));
      if (old) await repo.revokeDeviceSession(old.id);
    }
    setCookie(c, DEVICE_COOKIE, deviceToken, cookieOptions(DEVICE_TTL_MS));
    return c.json(await meView(learner));
  });

  // ── 학습자 자신 ──────────────────────────────────────────
  app.get("/me", async (c) => {
    const found = await currentLearner(c);
    if (!found) return c.json({ error: "not_connected" }, 401);
    void repo.touchDeviceSession(found.sessionId).catch(() => {});
    return c.json(await meView(found.learner));
  });

  app.post("/me/settings", async (c) => {
    const found = await currentLearner(c);
    if (!found) return c.json({ error: "not_connected" }, 401);
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const patch: Parameters<AccountsRepo["updateLearner"]>[1] = {};
    if (body.style === "proto" || body.style === "canvas") patch.uiStyle = body.style;
    if (body.dictLanguage === "ru" || body.dictLanguage === "en") patch.dictLanguage = body.dictLanguage;
    if (isPracticeVoiceKey(body.practiceVoice)) patch.practiceVoice = body.practiceVoice;
    if (body.exampleReading === "spoken" || body.exampleReading === "turns") patch.exampleReading = body.exampleReading;
    if (Object.keys(patch).length === 0) return c.json({ error: "nothing_to_change" }, 400);
    const learner = (await repo.updateLearner(found.learner.id, patch)) ?? found.learner;
    return c.json(await meView(learner));
  });

  app.post("/me/leave", async (c) => {
    const found = await currentLearner(c);
    if (found) await repo.revokeDeviceSession(found.sessionId);
    deleteCookie(c, DEVICE_COOKIE, { path: "/", secure: deps.secureCookies });
    return c.json({ ok: true });
  });

  // ── 연습 ────────────────────────────────────────────────
  const learn = new Hono<LearnVars>();
  learn.use("*", requireLearner);
  learn.route("/", createPracticeRoutes({ audio, resolveContent, now, dictReview: deps.dictReview === true }));
  app.route("/learn", learn);

  // 음원: 연결된 학습자나 로그인한 교사만.
  app.get("/sound/:ref", async (c) => {
    if (!(await currentLearner(c)) && !(await currentTeacher(c))) return c.json({ error: "not_connected" }, 401);
    const ref = c.req.param("ref");
    const { audio: resolvedAudio } = await resolveContent();
    const body =
      (await serveAudio(resolvedAudio, ref)) ?? (resolvedAudio !== audio ? await serveAudio(audio, ref) : null);
    if (!body) return c.json({ error: "audio_not_ready", display: "아직 준비 중" }, 404);
    return c.body(body.bytes.slice().buffer, 200, { "content-type": body.type, "cache-control": "private, max-age=3600" });
  });

  // ── 교사 ────────────────────────────────────────────────
  app.post("/teacher/login", async (c) => {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (!limitLogin(forwarded || "local")) return c.json({ error: "too_many_attempts" }, 429);
    const body = await readJson(c);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || email.length > 200 || !password || password.length > 200) return c.json({ error: "invalid_login" }, 400);
    const userId = await auth.signIn(email, password);
    if (!userId) return c.json({ error: "invalid_login" }, 401);
    const teacher = await repo.teacher(userId);
    if (!teacher) return c.json({ error: "not_a_teacher" }, 403);
    const token = randomToken();
    await repo.createTeacherSession(userId, hash("teacher", token), new Date(now().getTime() + TEACHER_TTL_MS).toISOString());
    setCookie(c, TEACHER_COOKIE, token, cookieOptions(TEACHER_TTL_MS));
    return c.json({ teacher: { displayName: teacher.displayName } });
  });

  app.post("/teacher/logout", async (c) => {
    const token = getCookie(c, TEACHER_COOKIE);
    if (token && TOKEN.test(token)) await repo.revokeTeacherSession(hash("teacher", token));
    deleteCookie(c, TEACHER_COOKIE, { path: "/", secure: deps.secureCookies });
    return c.json({ ok: true });
  });

  const teacher = new Hono<TeacherVars>();
  teacher.use("*", requireTeacher);

  const inviteOrigin = (c: Context) => deps.inviteOrigin ?? new URL(c.req.url).origin;

  teacher.get("/learners", async (c) => {
    const teacherId = c.get("teacherId");
    const [profile, learners] = await Promise.all([repo.teacher(teacherId), repo.learners(teacherId)]);
    const ids = learners.map((row) => row.id);
    const [invites, devices] = await Promise.all([repo.invitations(ids), repo.activeDeviceCounts(ids)]);
    const rows: TeacherLearnerRow[] = [];
    for (const learner of learners) {
      const latest = invites.filter((row) => row.learnerId === learner.id).at(-1);
      const store = await cache.forLearner(learner.id);
      rows.push({
        id: learner.id,
        nickname: learner.nickname,
        classLabel: learner.classLabel,
        homeLanguage: learner.homeLanguage,
        dictLanguage: learner.dictLanguage,
        isTest: learner.isTest,
        status: learner.status,
        invite: {
          status: inviteStatus(latest, now()),
          expiresAt: latest?.expiresAt ?? null,
          createdAt: latest?.createdAt ?? null,
        },
        devices: devices[learner.id] ?? 0,
        summary: summarize(summaryBase(learner), store.all()),
      });
    }
    const view: TeacherView = {
      teacher: { displayName: profile?.displayName ?? "교사" },
      inviteOrigin: inviteOrigin(c),
      learners: rows,
    };
    return c.json(view);
  });

  teacher.post("/learners", async (c) => {
    const body = await readJson(c);
    const nickname = cleanText(body?.nickname, 40);
    if (!nickname) return c.json({ error: "nickname_required" }, 400);
    const classLabel = body?.classLabel === undefined || body.classLabel === "" ? null : cleanText(body.classLabel, 40);
    const learner = await repo.createLearner({
      teacherId: c.get("teacherId"),
      nickname,
      classLabel,
      homeLanguage: body?.homeLanguage === "ru" ? "ru" : null,
      dictLanguage: body?.dictLanguage === "en" ? "en" : "ru",
      isTest: body?.isTest === true,
    });
    return c.json({ id: learner.id }, 201);
  });

  teacher.get("/learners/:id", async (c) => {
    const id = c.req.param("id");
    if (id === EXAMPLE_LEARNER.id) return c.json({ detail: exampleDetail() });
    const learner = await ownLearner(c.get("teacherId"), id);
    if (!learner) return c.json({ error: "not_found" }, 404);
    const events = (await cache.forLearner(learner.id)).all();
    return c.json({ detail: detail(summarize(summaryBase(learner), events), events) });
  });

  teacher.post("/learners/:id/settings", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    const body = await readJson(c);
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const patch: Parameters<AccountsRepo["updateLearner"]>[1] = {};
    if ("nickname" in body) {
      const nickname = cleanText(body.nickname, 40);
      if (!nickname) return c.json({ error: "nickname_required" }, 400);
      patch.nickname = nickname;
    }
    if ("classLabel" in body) patch.classLabel = body.classLabel === "" || body.classLabel === null ? null : cleanText(body.classLabel, 40);
    if (body.homeLanguage === "ru" || body.homeLanguage === null) patch.homeLanguage = body.homeLanguage;
    if (body.dictLanguage === "ru" || body.dictLanguage === "en") patch.dictLanguage = body.dictLanguage;
    if (body.itemKind === "word" || body.itemKind === "pseudo") patch.itemKind = body.itemKind;
    await repo.updateLearner(learner.id, patch);
    return c.json({ ok: true });
  });

  teacher.post("/learners/:id/invitations", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    if (learner.status !== "active") return c.json({ error: "learner_archived" }, 409);
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + INVITE_TTL_MS).toISOString();
    await repo.createInvitation(learner.id, c.get("teacherId"), hash("invite", token), expiresAt);
    const issued: InviteIssued = { url: `${inviteOrigin(c)}/join#token=${token}`, expiresAt };
    return c.json(issued, 201);
  });

  teacher.post("/learners/:id/invitations/revoke", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    return c.json({ revoked: await repo.revokeOpenInvitations(learner.id) });
  });

  teacher.post("/learners/:id/devices/revoke", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    return c.json({ revoked: await repo.revokeLearnerDevices(learner.id) });
  });

  // 종료: 상태를 바꾸고, 쓰지 않은 초대를 폐기하고, 기기 세션을 모두 끊는다. 학습 기록은 남긴다.
  teacher.post("/learners/:id/archive", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    await repo.setLearnerStatus(learner.id, "archived");
    const [invitations, devices] = await Promise.all([
      repo.revokeOpenInvitations(learner.id),
      repo.revokeLearnerDevices(learner.id),
    ]);
    return c.json({ status: "archived", revokedInvitations: invitations, revokedDevices: devices });
  });

  // 다시 열기: 상태만 되돌린다. 링크는 교사가 '링크 새로 만들기'로 따로 만든다.
  teacher.post("/learners/:id/reopen", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    await repo.setLearnerStatus(learner.id, "active");
    return c.json({ status: "active" });
  });

  // 삭제: 종료한 학습자나 시험 학습자만. 초대·기기·학습 기록도 함께 지워진다.
  teacher.delete("/learners/:id", async (c) => {
    const learner = await ownLearner(c.get("teacherId"), c.req.param("id"));
    if (!learner) return c.json({ error: "not_found" }, 404);
    if (learner.status !== "archived" && !learner.isTest) return c.json({ error: "archive_first" }, 409);
    await repo.deleteLearner(learner.id);
    cache.forget(learner.id);
    return c.json({ deleted: true });
  });

  const voicesView = async (): Promise<VoicesView> => {
    const { audio: resolvedAudio } = await resolveContent();
    const picker = audioPicker(resolvedAudio, DEFAULT_PRACTICE_VOICE);
    const chosen = await repo.appSetting("voiceChoice");
    return {
      sampleText: AUDITION_TEXT,
      flatStyle: FLAT_READING_STYLE,
      model: FLASH_TTS_MODEL,
      practiceVoice: picker.voice(),
      practiceVoiceKey: DEFAULT_PRACTICE_VOICE,
      practiceVoices: practiceVoicesView(resolvedAudio),
      chosen: typeof chosen === "string" ? chosen : null,
      voices: AUDITION_VOICES.map((voice) => ({
        ...voice,
        audioRef: resolvedAudio.refFor(auditionAudioId(voice.voice)) ?? audio.refFor(auditionAudioId(voice.voice)),
        flatAudioRef: resolvedAudio.refFor(flatAuditionAudioId(voice.voice)) ?? audio.refFor(flatAuditionAudioId(voice.voice)),
      })),
    };
  };

  teacher.get("/voices", async (c) => c.json(await voicesView()));

  // 만든 음원 목록(목소리 화면의 대시보드). 생성은 부르지 않는다.
  teacher.get("/audio-inventory", async (c) => {
    if (deps.contentRepo) {
      try {
        const dbAssets = await deps.contentRepo.listAudioAssets();
        if (dbAssets.length > 0) {
          const [dbItems, dbStage0] = await Promise.all([
            deps.contentRepo.listItems({ includeHidden: false }),
            deps.contentRepo.listStageZero(),
          ]);
          const workingSnap: ContentSnapshot =
            dbItems.length > 0
              ? { seq: 0, releasedAt: "", items: dbItems, stage0: dbStage0, audio: {} }
              : snapshotFromReferenceJson();
          return c.json(buildInventory(createAssetsInventoryAudio(dbAssets), "DB · phoneme_audio_assets", workingSnap));
        }
      } catch (error) {
        if (!isMissingContentTableError(error)) throw error;
      }
    }
    return c.json(buildInventory(audio));
  });

  teacher.route(
    "/content",
    createContentRoutes({
      contentRepo: deps.contentRepo,
      fallbackAudio: audio,
      audioStore: deps.audioStore,
      snapshotCache: snapshotCache ?? undefined,
      ttsApiKey: deps.ttsApiKey ?? null,
      ttsFetcher: deps.ttsFetcher,
      now,
    }),
  );

  teacher.post("/voice-choice", async (c) => {
    const body = await readJson(c);
    const voice = body?.voice;
    if (typeof voice !== "string" || !AUDITION_VOICES.some((row) => row.voice === voice)) {
      return c.json({ error: "unknown_voice" }, 400);
    }
    await repo.setAppSetting("voiceChoice", voice);
    return c.json(await voicesView());
  });

  app.route("/teacher", teacher);
  return app;
}

function summaryBase(learner: LearnerRow) {
  const home = learner.homeLanguage ? LANGUAGE_LABEL[learner.homeLanguage] : "모어 미기록";
  return {
    id: learner.id,
    name: learner.isTest ? `${learner.nickname} (시험)` : learner.nickname,
    languages: `${home} · 사전 ${DICT_LABEL[learner.dictLanguage]}`,
    kind: "learner" as const,
  };
}
