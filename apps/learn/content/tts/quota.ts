// 하루 TTS 요청 한도 계산. 태평양 시간 자정(한국 오후 5시)에 날짜가 바뀐다.

export const DAILY_TTS_LIMIT = 100;

export function ttsQuotaDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
