// 단건 TTS 생성(Cloudflare·Node 공용). node:* 모듈을 쓰지 않고, 키를 오류 문구에 넣지 않는다.
// 요청 본문 모양은 PC 묶음 생성(batch-plan.ts groupContents)과 같은 규칙("항목 하나, per_content_group, 앞뒤 '네.' 없음")을 쓴다.
import { practiceVoiceName, type PracticeVoiceKey } from "../../content/practice-voices.ts";
import { groupContents, type BatchGroup, type GroupContent } from "../../content/tts/batch-plan.ts";
import {
  FLASH_TTS_MODEL,
  FLAT_READING_STYLE,
  authHeaders,
  decodeBase64,
  interactionsEndpoint,
  normalizeToWav,
  parseInteractionAudio,
  sha256Hex,
} from "../../content/tts/pipeline.ts";
import { wavDurationMs } from "../../content/tts/wav-info.ts";

export const SINGLE_TTS_METHOD = "per_content_single" as const;

export type SingleTtsSettings = {
  requestStyle: "interactions";
  method: typeof SINGLE_TTS_METHOD;
  stylePrompt: string | null;
};

export type SingleTtsRequestBody = {
  model: string;
  input: [{ type: "user_input"; content: GroupContent[] }];
  response_format: { type: "audio" };
  generation_config: { speech_config: [{ voice: string }] };
};

export function buildSingleTtsRequestBody(input: {
  text: string;
  kind: "word" | "sentence";
  voiceKey: PracticeVoiceKey;
  model?: string;
}): SingleTtsRequestBody {
  const style = input.kind === "word" ? FLAT_READING_STYLE : null;
  const singleGroup: BatchGroup = {
    groupId: `single-${input.kind}`,
    kind: input.kind === "word" ? "words" : "sentences",
    method: "per_content_group",
    style,
    fillers: false,
    minGapMs: input.kind === "word" ? 300 : 600,
    items: [{ id: "single", text: input.text, unitKind: input.kind }],
  };
  return {
    model: input.model ?? FLASH_TTS_MODEL,
    input: [{ type: "user_input", content: groupContents(singleGroup) }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: practiceVoiceName(input.voiceKey) }] },
  };
}

export type SingleTtsResult =
  | {
      ok: true;
      bytes: Uint8Array;
      mime: "audio/wav";
      durationMs: number | null;
      sha256: string;
      model: string;
      stylePrompt: string | null;
      settings: SingleTtsSettings;
    }
  | {
      ok: false;
      errorCode: string;
      status: 409 | 429 | 502;
      message: string;
    };

export async function generateSingleTts(input: {
  text: string;
  kind: "word" | "sentence";
  voiceKey: PracticeVoiceKey;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<SingleTtsResult> {
  const stylePrompt = input.kind === "word" ? FLAT_READING_STYLE : null;
  const body = buildSingleTtsRequestBody({
    text: input.text,
    kind: input.kind,
    voiceKey: input.voiceKey,
  });
  const fetcher = input.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher(interactionsEndpoint(), {
      method: "POST",
      headers: authHeaders(input.apiKey),
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      errorCode: "network_error",
      status: 502,
      message: "음성 서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (response.status === 429) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    if (/per day/i.test(detail)) {
      return {
        ok: false,
        errorCode: "upstream_quota",
        status: 409,
        message: "오늘 한도를 다 썼어요. 오후 5시에 다시 열려요.",
      };
    }
    return {
      ok: false,
      errorCode: "upstream_rate_limit",
      status: 429,
      message: "요청이 몰렸어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      errorCode: `http_${response.status}`,
      status: 502,
      message: `음성을 만들지 못했어요(${response.status}). 잠시 후 다시 시도해 주세요.`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      errorCode: "invalid_audio",
      status: 502,
      message: "음성 응답을 읽지 못했어요.",
    };
  }

  const parsed = parseInteractionAudio(payload);
  let normalized: ReturnType<typeof normalizeToWav> = null;
  if (parsed) {
    try {
      normalized = normalizeToWav(decodeBase64(parsed.base64), parsed.mime);
    } catch {
      normalized = null;
    }
  }
  if (!normalized || normalized.bytes.length === 0) {
    return {
      ok: false,
      errorCode: "invalid_audio",
      status: 502,
      message: "음성 응답이 비어 있거나 WAV로 바꾸지 못했어요.",
    };
  }

  const sha256 = await sha256Hex(normalized.bytes);
  const durationMs = wavDurationMs(normalized.bytes.subarray(0, 64), normalized.bytes.length);

  return {
    ok: true,
    bytes: normalized.bytes,
    mime: normalized.mime,
    durationMs,
    sha256,
    model: FLASH_TTS_MODEL,
    stylePrompt,
    settings: {
      requestStyle: "interactions",
      method: SINGLE_TTS_METHOD,
      stylePrompt,
    },
  };
}
