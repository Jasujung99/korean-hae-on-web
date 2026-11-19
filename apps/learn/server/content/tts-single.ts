// 단건 TTS 생성(Cloudflare·Node 공용). node:* 모듈을 쓰지 않고, 키를 오류 문구에 넣지 않는다.
import { practiceVoiceName, type PracticeVoiceKey } from "../../content/practice-voices.ts";
import {
  FLASH_TTS_MODEL,
  authHeaders,
  buildInteractionBody,
  decodeBase64,
  interactionsEndpoint,
  normalizeToWav,
  parseInteractionAudio,
  sha256Hex,
  styleForKind,
} from "../../content/tts/pipeline.ts";
import { wavDurationMs } from "../../content/tts/wav-info.ts";

export type SingleTtsResult =
  | {
      ok: true;
      bytes: Uint8Array;
      mime: "audio/wav";
      durationMs: number | null;
      sha256: string;
      model: string;
      stylePrompt: string | null;
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
  const voiceName = practiceVoiceName(input.voiceKey);
  const stylePrompt = styleForKind(input.kind);
  const fetcher = input.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher(interactionsEndpoint(), {
      method: "POST",
      headers: authHeaders(input.apiKey),
      body: JSON.stringify(buildInteractionBody(input.text, voiceName, stylePrompt)),
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
  };
}
