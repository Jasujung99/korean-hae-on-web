// 학습 기록 한 줄의 모양. 저장은 server/accounts(phoneme_events)가 맡는다. 덧붙이기만 하고, 같은 이벤트 id는 한 번만 받는다.
export type StoredEvent = {
  id: string;
  learnerId: string;
  sessionId: string | null;
  seq: number;
  type: string;
  clientTime: string;
  receivedAt: string;
  payload: Record<string, unknown>;
};
