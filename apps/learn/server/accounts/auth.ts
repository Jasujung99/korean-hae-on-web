// 토큰 만들기·해시, 교사 비밀번호 확인.
// 초대·기기·교사 세션 토큰은 원문을 저장하지 않고 서버 비밀값으로 만든 HMAC만 저장한다.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function makeHasher(secret: string) {
  if (secret.length < 32) throw new Error("LEARN_SESSION_SECRET must be at least 32 characters");
  return (purpose: "invite" | "device" | "teacher" | "claim", value: string) =>
    createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

export type Hasher = ReturnType<typeof makeHasher>;

/** 같은 초대·같은 claim 키에서는 같은 기기 토큰이 나온다. 응답을 잃고 다시 눌러도 같은 세션을 돌려준다. */
export function deviceTokenFor(secret: string, inviteHash: string, claimKey: string): string {
  return createHmac("sha256", secret).update(`device-token:${inviteHash}:${claimKey}`).digest("base64url");
}

export function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type TeacherAuth = {
  /** 이메일·비밀번호가 맞으면 auth.users의 id를 돌려준다. 비밀번호는 저장하거나 기록하지 않는다. */
  signIn(email: string, password: string): Promise<string | null>;
};

export function supabaseTeacherAuth(config: { url: string; publishableKey: string }, fetcher: typeof fetch = fetch): TeacherAuth {
  return {
    async signIn(email, password) {
      const response = await fetcher(`${config.url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.publishableKey, "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { user?: { id?: unknown } };
      return typeof body.user?.id === "string" ? body.user.id : null;
    },
  };
}

export function memoryTeacherAuth(accounts: Array<{ email: string; password: string; userId: string }>): TeacherAuth {
  return {
    async signIn(email, password) {
      const row = accounts.find((item) => item.email === email.trim().toLowerCase());
      return row && sameText(row.password, password) ? row.userId : null;
    },
  };
}

/** 로그인 시도 제한: 같은 주소에서 10분에 10번까지. */
export function createAttemptLimiter(limit = 10, windowMs = 10 * 60_000, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const since = now() - windowMs;
    const list = (hits.get(key) ?? []).filter((time) => time > since);
    if (list.length >= limit) {
      hits.set(key, list);
      return false;
    }
    list.push(now());
    hits.set(key, list);
    return true;
  };
}
