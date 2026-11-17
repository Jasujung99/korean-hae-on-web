// 학습자별 기록 캐시. DB가 원본이고, 한 서버 프로세스 안에서 읽기를 빠르게 하려고 메모리에 둔다.
// 쓰기는 DB에 먼저 저장하고, 저장된 것만 캐시에 넣는다. 서버를 여러 대 띄우는 구성은 쓰지 않는다.
import type { StoredEvent } from "../preview/store.ts";
import type { AccountsRepo } from "./repo.ts";

export type LearnerStore = {
  all(): StoredEvent[];
  byId(id: string): StoredEvent | undefined;
  append(events: StoredEvent[]): Promise<{ accepted: number; duplicates: number }>;
};

type Bucket = { list: StoredEvent[]; index: Map<string, StoredEvent>; queue: Promise<unknown> };

export function createEventCache(repo: AccountsRepo) {
  const buckets = new Map<string, Promise<Bucket>>();

  const load = (learnerId: string): Promise<Bucket> => {
    let pending = buckets.get(learnerId);
    if (!pending) {
      pending = repo.events(learnerId).then((list) => ({
        list,
        index: new Map(list.map((event) => [event.id, event])),
        queue: Promise.resolve(),
      }));
      pending.catch(() => buckets.delete(learnerId));
      buckets.set(learnerId, pending);
    }
    return pending;
  };

  return {
    async forLearner(learnerId: string): Promise<LearnerStore> {
      const bucket = await load(learnerId);
      return {
        all: () => [...bucket.list],
        byId: (id) => bucket.index.get(id),
        append(events) {
          // 같은 학습자의 쓰기는 차례로 처리해 중복 판단이 엇갈리지 않게 한다.
          const run = bucket.queue.then(async () => {
            const fresh = events
              .map((event) => ({ ...event, learnerId }))
              .filter((event, position, list) => !bucket.index.has(event.id) && list.findIndex((row) => row.id === event.id) === position);
            const saved = new Set(fresh.length > 0 ? await repo.appendEvents(learnerId, fresh) : []);
            for (const event of fresh) {
              if (!saved.has(event.id)) continue;
              bucket.index.set(event.id, event);
              bucket.list.push(event);
            }
            return { accepted: saved.size, duplicates: events.length - saved.size };
          });
          bucket.queue = run.catch(() => {});
          return run;
        },
      };
    },
    forget(learnerId: string) {
      buckets.delete(learnerId);
    },
  };
}

export type EventCache = ReturnType<typeof createEventCache>;
