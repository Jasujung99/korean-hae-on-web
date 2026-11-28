export const TASKS = {
  consonant_identification: {
    key: "consonant_identification",
    label: "듣고 자음 고르기",
  },
  abx: {
    key: "abx",
    label: "두 소리 비교",
  },
  meaning_check: {
    key: "meaning_check",
    label: "뜻 확인",
  },
} as const;

export type TaskKey = keyof typeof TASKS;

export const TASK_KEYS = Object.keys(TASKS) as TaskKey[];

export function taskLabel(key: TaskKey): string {
  return TASKS[key].label;
}
