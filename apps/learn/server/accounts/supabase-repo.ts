// Supabase(PostgREST) 저장소. 같은 origin 학습 서버만 secret 키로 부른다. 키는 환경 변수로만 받고 남기지 않는다.
// phoneme_* 표는 RLS가 켜져 있고 브라우저 키로는 접근할 수 없다.
import type { StoredEvent } from "../preview/store.ts";
import type { AccountsRepo, ClaimStatus, InvitationRow, LearnerRow, SessionRow } from "./repo.ts";

export type DbConfig = { url: string; secretKey: string };

type Row = Record<string, unknown>;

export class DbError extends Error {
  constructor(public status: number, public code: string) {
    super(`db ${status} ${code}`);
  }
}

function learnerFrom(row: Row): LearnerRow {
  return {
    id: String(row.id),
    teacherId: String(row.teacher_id),
    nickname: String(row.nickname),
    classLabel: (row.class_label as string | null) ?? null,
    homeLanguage: row.home_language === "ru" ? "ru" : null,
    dictLanguage: row.dict_language === "en" ? "en" : "ru",
    uiStyle: row.ui_style === "proto" ? "proto" : "canvas",
    practiceVoice: String(row.practice_voice ?? "charon"),
    itemKind: row.item_kind === "pseudo" ? "pseudo" : "word",
    status: row.status === "archived" ? "archived" : "active",
    isTest: row.is_test === true,
    createdAt: String(row.created_at),
  };
}

function invitationFrom(row: Row): InvitationRow {
  return {
    id: String(row.id),
    learnerId: String(row.learner_id),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    consumedAt: (row.consumed_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

function sessionFrom(row: Row, owner: string): SessionRow {
  return {
    id: String(row.id),
    ownerId: String(row[owner]),
    expiresAt: String(row.expires_at),
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

function eventFrom(row: Row): StoredEvent {
  return {
    id: String(row.id),
    learnerId: String(row.learner_id),
    sessionId: (row.session_id as string | null) ?? null,
    seq: Number(row.seq ?? 0),
    type: String(row.type),
    clientTime: String(row.client_time),
    receivedAt: String(row.received_at),
    payload: (row.payload as Record<string, unknown>) ?? {},
  };
}

const LEARNER_FIELDS: Record<string, string> = {
  nickname: "nickname",
  classLabel: "class_label",
  homeLanguage: "home_language",
  dictLanguage: "dict_language",
  uiStyle: "ui_style",
  practiceVoice: "practice_voice",
  itemKind: "item_kind",
};

const inList = (ids: string[]) => `in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`;

export function createSupabaseRepo(config: DbConfig, fetcher: typeof fetch = fetch): AccountsRepo {
  const base = `${config.url.replace(/\/$/, "")}/rest/v1`;

  async function call(method: string, path: string, body?: unknown, prefer?: string): Promise<Row[]> {
    const headers: Record<string, string> = {
      apikey: config.secretKey,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (prefer) headers.prefer = prefer;
    const response = await fetcher(`${base}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let code = "unknown";
      try {
        const detail = (await response.json()) as { code?: string };
        code = detail.code ?? code;
      } catch {
        // 본문이 없으면 상태 코드만 남긴다.
      }
      throw new DbError(response.status, code);
    }
    if (response.status === 204) return [];
    const text = await response.text();
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as Row[]) : [parsed as Row];
  }

  const nowIso = () => new Date().toISOString();

  return {
    kind: "supabase",
    async teacher(userId) {
      const rows = await call("GET", `phoneme_teachers?user_id=eq.${encodeURIComponent(userId)}&select=user_id,display_name`);
      const row = rows[0];
      return row ? { userId: String(row.user_id), displayName: String(row.display_name) } : null;
    },
    async learners(teacherId) {
      const rows = await call(
        "GET",
        `phoneme_learners?teacher_id=eq.${encodeURIComponent(teacherId)}&status=eq.active&order=created_at.asc`,
      );
      return rows.map(learnerFrom);
    },
    async learner(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const rows = await call("GET", `phoneme_learners?id=eq.${id}`);
      return rows[0] ? learnerFrom(rows[0]) : null;
    },
    async createLearner(input) {
      const rows = await call(
        "POST",
        "phoneme_learners",
        {
          teacher_id: input.teacherId,
          nickname: input.nickname,
          class_label: input.classLabel,
          home_language: input.homeLanguage,
          dict_language: input.dictLanguage,
          is_test: input.isTest,
        },
        "return=representation",
      );
      return learnerFrom(rows[0] as Row);
    },
    async updateLearner(id, patch) {
      const body: Row = { updated_at: nowIso() };
      for (const [key, column] of Object.entries(LEARNER_FIELDS)) {
        if (key in patch) body[column] = (patch as Row)[key];
      }
      const rows = await call("PATCH", `phoneme_learners?id=eq.${id}`, body, "return=representation");
      return rows[0] ? learnerFrom(rows[0]) : null;
    },
    async createInvitation(learnerId, teacherId, tokenHash, expiresAt) {
      await this.revokeOpenInvitations(learnerId);
      const rows = await call(
        "POST",
        "phoneme_invitations",
        { learner_id: learnerId, created_by: teacherId, token_hash: tokenHash, expires_at: expiresAt },
        "return=representation",
      );
      return invitationFrom(rows[0] as Row);
    },
    async invitations(learnerIds) {
      if (learnerIds.length === 0) return [];
      const rows = await call(
        "GET",
        `phoneme_invitations?learner_id=${inList(learnerIds)}&select=id,learner_id,created_at,expires_at,consumed_at,revoked_at&order=created_at.asc`,
      );
      return rows.map(invitationFrom);
    },
    async revokeOpenInvitations(learnerId) {
      const rows = await call(
        "PATCH",
        `phoneme_invitations?learner_id=eq.${learnerId}&consumed_at=is.null&revoked_at=is.null`,
        { revoked_at: nowIso() },
        "return=representation",
      );
      return rows.length;
    },
    async invitationByHash(tokenHash) {
      const rows = await call(
        "GET",
        `phoneme_invitations?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,learner_id,created_at,expires_at,consumed_at,revoked_at`,
      );
      return rows[0] ? invitationFrom(rows[0]) : null;
    },
    async claim(input) {
      const rows = await call("POST", "rpc/phoneme_claim_invitation", {
        p_token_hash: input.tokenHash,
        p_claim_key_hash: input.claimKeyHash,
        p_session_hash: input.sessionHash,
        p_session_expires: input.sessionExpiresAt,
        p_device_label: input.deviceLabel,
      });
      const row = rows[0];
      const status = String(row?.status ?? "invalid") as ClaimStatus;
      return { status, learnerId: (row?.learner_id as string | null) ?? null };
    },
    async deviceSession(tokenHash) {
      const rows = await call(
        "GET",
        `phoneme_device_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,learner_id,expires_at,revoked_at`,
      );
      return rows[0] ? sessionFrom(rows[0], "learner_id") : null;
    },
    async touchDeviceSession(id) {
      await call("PATCH", `phoneme_device_sessions?id=eq.${id}`, { last_seen_at: nowIso() });
    },
    async revokeDeviceSession(id) {
      await call("PATCH", `phoneme_device_sessions?id=eq.${id}&revoked_at=is.null`, { revoked_at: nowIso() });
    },
    async revokeLearnerDevices(learnerId) {
      const rows = await call(
        "PATCH",
        `phoneme_device_sessions?learner_id=eq.${learnerId}&revoked_at=is.null`,
        { revoked_at: nowIso() },
        "return=representation",
      );
      return rows.length;
    },
    async activeDeviceCounts(learnerIds) {
      const out: Record<string, number> = {};
      for (const id of learnerIds) out[id] = 0;
      if (learnerIds.length === 0) return out;
      const rows = await call(
        "GET",
        `phoneme_device_sessions?learner_id=${inList(learnerIds)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(nowIso())}&select=learner_id`,
      );
      for (const row of rows) {
        const id = String(row.learner_id);
        out[id] = (out[id] ?? 0) + 1;
      }
      return out;
    },
    async createTeacherSession(teacherId, tokenHash, expiresAt) {
      await call("POST", "phoneme_teacher_sessions", { teacher_id: teacherId, token_hash: tokenHash, expires_at: expiresAt });
    },
    async teacherSession(tokenHash) {
      const rows = await call(
        "GET",
        `phoneme_teacher_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,teacher_id,expires_at,revoked_at`,
      );
      return rows[0] ? sessionFrom(rows[0], "teacher_id") : null;
    },
    async revokeTeacherSession(tokenHash) {
      await call("PATCH", `phoneme_teacher_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, { revoked_at: nowIso() });
    },
    async events(learnerId) {
      const out: StoredEvent[] = [];
      const page = 1000;
      for (let offset = 0; ; offset += page) {
        const rows = await call(
          "GET",
          `phoneme_events?learner_id=eq.${learnerId}&order=received_at.asc,seq.asc&limit=${page}&offset=${offset}`,
        );
        out.push(...rows.map(eventFrom));
        if (rows.length < page) break;
      }
      return out;
    },
    async appendEvents(learnerId, list) {
      if (list.length === 0) return [];
      const rows = await call(
        "POST",
        "phoneme_events?on_conflict=learner_id,id",
        list.map((event) => ({
          learner_id: learnerId,
          id: event.id,
          session_id: event.sessionId,
          seq: Math.trunc(event.seq),
          type: event.type,
          client_time: event.clientTime,
          received_at: event.receivedAt,
          payload: event.payload,
        })),
        "resolution=ignore-duplicates,return=representation",
      );
      return rows.map((row) => String(row.id));
    },
    async appSetting(key) {
      const rows = await call("GET", `phoneme_app_settings?key=eq.${encodeURIComponent(key)}&select=value`);
      return rows[0]?.value;
    },
    async setAppSetting(key, value) {
      await call("POST", "phoneme_app_settings?on_conflict=key", { key, value, updated_at: nowIso() }, "resolution=merge-duplicates");
    },
  };
}
