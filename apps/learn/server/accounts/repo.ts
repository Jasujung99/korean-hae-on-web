// 계정 저장소 계약. 운영은 Supabase(phoneme_* 표), 시험은 메모리 구현을 쓴다.
// 화면에서 오는 learner/teacher id를 믿지 않는다. 라우트가 쿠키 세션으로 찾은 id만 넘긴다.
import type { StoredEvent } from "../preview/store.ts";

export type DictLanguage = "ru" | "en";
export type UiStyle = "proto" | "canvas";
export type ItemKindSetting = "word" | "pseudo";
/** 예문 읽기: spoken = 말하듯이(기본), turns = 또박또박 */
export type ExampleReading = "spoken" | "turns";

export type LearnerRow = {
  id: string;
  teacherId: string;
  nickname: string;
  classLabel: string | null;
  homeLanguage: "ru" | null;
  dictLanguage: DictLanguage;
  uiStyle: UiStyle;
  practiceVoice: string;
  itemKind: ItemKindSetting;
  exampleReading: ExampleReading;
  status: "active" | "archived";
  isTest: boolean;
  createdAt: string;
};

export type LearnerPatch = Partial<
  Pick<LearnerRow, "nickname" | "classLabel" | "homeLanguage" | "dictLanguage" | "uiStyle" | "practiceVoice" | "itemKind" | "exampleReading">
>;

export type NewLearner = {
  teacherId: string;
  nickname: string;
  classLabel: string | null;
  homeLanguage: "ru" | null;
  dictLanguage: DictLanguage;
  isTest: boolean;
};

export type InvitationRow = {
  id: string;
  learnerId: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export type SessionRow = {
  id: string;
  ownerId: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type ClaimStatus = "claimed" | "replayed" | "invalid" | "used" | "revoked" | "expired";

export type ClaimInput = {
  tokenHash: string;
  claimKeyHash: string;
  sessionHash: string;
  sessionExpiresAt: string;
  deviceLabel: string;
};

export type AccountsRepo = {
  kind: "memory" | "supabase";
  teacher(userId: string): Promise<{ userId: string; displayName: string } | null>;

  /** 진행 중·종료한 학습자를 모두 돌려준다. 나누는 것은 화면이 한다. */
  learners(teacherId: string): Promise<LearnerRow[]>;
  learner(id: string): Promise<LearnerRow | null>;
  createLearner(input: NewLearner): Promise<LearnerRow>;
  updateLearner(id: string, patch: LearnerPatch): Promise<LearnerRow | null>;
  /** 종료(archived)·다시 열기(active). 초대·기기 정리는 라우트가 따로 부른다. */
  setLearnerStatus(id: string, status: LearnerRow["status"]): Promise<LearnerRow | null>;
  /** 학습자 한 줄을 지운다. 초대·기기 세션·학습 기록도 함께 사라진다(DB는 on delete cascade). */
  deleteLearner(id: string): Promise<boolean>;

  /** 같은 학습자의 쓰지 않은 이전 초대를 폐기하고 새 초대를 만든다. */
  createInvitation(learnerId: string, teacherId: string, tokenHash: string, expiresAt: string): Promise<InvitationRow>;
  invitations(learnerIds: string[]): Promise<InvitationRow[]>;
  revokeOpenInvitations(learnerId: string): Promise<number>;
  invitationByHash(tokenHash: string): Promise<InvitationRow | null>;
  claim(input: ClaimInput): Promise<{ status: ClaimStatus; learnerId: string | null }>;

  deviceSession(tokenHash: string): Promise<SessionRow | null>;
  touchDeviceSession(id: string): Promise<void>;
  revokeDeviceSession(id: string): Promise<void>;
  revokeLearnerDevices(learnerId: string): Promise<number>;
  activeDeviceCounts(learnerIds: string[]): Promise<Record<string, number>>;

  createTeacherSession(teacherId: string, tokenHash: string, expiresAt: string): Promise<void>;
  teacherSession(tokenHash: string): Promise<SessionRow | null>;
  revokeTeacherSession(tokenHash: string): Promise<void>;

  events(learnerId: string): Promise<StoredEvent[]>;
  /** 같은 (학습자, 이벤트 id)는 한 번만 저장한다. 실제로 저장된 id를 돌려준다. */
  appendEvents(learnerId: string, events: StoredEvent[]): Promise<string[]>;

  appSetting(key: string): Promise<unknown>;
  setAppSetting(key: string, value: unknown): Promise<void>;
};

export function isLive(row: { expiresAt: string; revokedAt: string | null }, now: Date): boolean {
  return row.revokedAt === null && Date.parse(row.expiresAt) > now.getTime();
}
