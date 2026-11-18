// 시험용 메모리 저장소. Supabase 구현과 같은 규칙(초대 일회성, 재시도 복구, 이벤트 중복 제거)을 지킨다.
import { randomUUID } from "node:crypto";
import type { StoredEvent } from "../preview/store.ts";
import type { AccountsRepo, InvitationRow, LearnerRow, SessionRow } from "./repo.ts";

type Invitation = InvitationRow & { tokenHash: string; claimKeyHash: string | null; deviceSessionId: string | null };
type Device = SessionRow & { tokenHash: string };

export function createMemoryRepo(options: { now?: () => Date; teachers?: Array<{ userId: string; displayName: string }> } = {}) {
  const now = options.now ?? (() => new Date());
  const teachers = new Map((options.teachers ?? []).map((row) => [row.userId, row]));
  const learners = new Map<string, LearnerRow>();
  const invitations: Invitation[] = [];
  const devices: Device[] = [];
  const teacherSessions: Device[] = [];
  const events = new Map<string, StoredEvent[]>();
  const settings = new Map<string, unknown>();
  const iso = () => now().toISOString();

  const repo: AccountsRepo & { addTeacher(userId: string, displayName: string): void } = {
    kind: "memory",
    addTeacher(userId, displayName) {
      teachers.set(userId, { userId, displayName });
    },
    async teacher(userId) {
      return teachers.get(userId) ?? null;
    },
    async learners(teacherId) {
      return [...learners.values()].filter((row) => row.teacherId === teacherId);
    },
    async learner(id) {
      return learners.get(id) ?? null;
    },
    async createLearner(input) {
      const row: LearnerRow = {
        id: randomUUID(),
        teacherId: input.teacherId,
        nickname: input.nickname,
        classLabel: input.classLabel,
        homeLanguage: input.homeLanguage,
        dictLanguage: input.dictLanguage,
        uiStyle: "canvas",
        practiceVoice: "charon",
        itemKind: "word",
        exampleReading: "spoken",
        status: "active",
        isTest: input.isTest,
        createdAt: iso(),
      };
      learners.set(row.id, row);
      return row;
    },
    async updateLearner(id, patch) {
      const row = learners.get(id);
      if (!row) return null;
      const next = { ...row, ...patch };
      learners.set(id, next);
      return next;
    },
    async createInvitation(learnerId, _teacherId, tokenHash, expiresAt) {
      await repo.revokeOpenInvitations(learnerId);
      const row: Invitation = {
        id: randomUUID(),
        learnerId,
        tokenHash,
        createdAt: iso(),
        expiresAt,
        consumedAt: null,
        revokedAt: null,
        claimKeyHash: null,
        deviceSessionId: null,
      };
      invitations.push(row);
      return row;
    },
    async invitations(learnerIds) {
      return invitations.filter((row) => learnerIds.includes(row.learnerId));
    },
    async revokeOpenInvitations(learnerId) {
      let count = 0;
      for (const row of invitations) {
        if (row.learnerId === learnerId && !row.consumedAt && !row.revokedAt) {
          row.revokedAt = iso();
          count += 1;
        }
      }
      return count;
    },
    async invitationByHash(tokenHash) {
      return invitations.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async claim(input) {
      const row = invitations.find((item) => item.tokenHash === input.tokenHash);
      if (!row) return { status: "invalid", learnerId: null };
      if (row.consumedAt) {
        const recent = Date.parse(row.consumedAt) > now().getTime() - 10 * 60_000;
        return row.claimKeyHash === input.claimKeyHash && recent
          ? { status: "replayed", learnerId: row.learnerId }
          : { status: "used", learnerId: null };
      }
      if (row.revokedAt) return { status: "revoked", learnerId: null };
      if (Date.parse(row.expiresAt) <= now().getTime()) return { status: "expired", learnerId: null };
      const device: Device = {
        id: randomUUID(),
        ownerId: row.learnerId,
        tokenHash: input.sessionHash,
        expiresAt: input.sessionExpiresAt,
        revokedAt: null,
      };
      devices.push(device);
      row.consumedAt = iso();
      row.claimKeyHash = input.claimKeyHash;
      row.deviceSessionId = device.id;
      return { status: "claimed", learnerId: row.learnerId };
    },
    async deviceSession(tokenHash) {
      return devices.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async touchDeviceSession() {},
    async revokeDeviceSession(id) {
      const row = devices.find((item) => item.id === id);
      if (row && !row.revokedAt) row.revokedAt = iso();
    },
    async revokeLearnerDevices(learnerId) {
      let count = 0;
      for (const row of devices) {
        if (row.ownerId === learnerId && !row.revokedAt) {
          row.revokedAt = iso();
          count += 1;
        }
      }
      return count;
    },
    async activeDeviceCounts(learnerIds) {
      const out: Record<string, number> = {};
      for (const id of learnerIds) out[id] = 0;
      for (const row of devices) {
        if (learnerIds.includes(row.ownerId) && !row.revokedAt && Date.parse(row.expiresAt) > now().getTime()) {
          out[row.ownerId] = (out[row.ownerId] ?? 0) + 1;
        }
      }
      return out;
    },
    async createTeacherSession(teacherId, tokenHash, expiresAt) {
      teacherSessions.push({ id: randomUUID(), ownerId: teacherId, tokenHash, expiresAt, revokedAt: null });
    },
    async teacherSession(tokenHash) {
      return teacherSessions.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async revokeTeacherSession(tokenHash) {
      const row = teacherSessions.find((item) => item.tokenHash === tokenHash);
      if (row && !row.revokedAt) row.revokedAt = iso();
    },
    async events(learnerId) {
      return [...(events.get(learnerId) ?? [])];
    },
    async appendEvents(learnerId, list) {
      const bucket = events.get(learnerId) ?? [];
      events.set(learnerId, bucket);
      const saved: string[] = [];
      for (const event of list) {
        if (bucket.some((row) => row.id === event.id)) continue;
        bucket.push({ ...event, learnerId });
        saved.push(event.id);
      }
      return saved;
    },
    async appSetting(key) {
      return settings.get(key);
    },
    async setAppSetting(key, value) {
      settings.set(key, value);
    },
  };
  return repo;
}
