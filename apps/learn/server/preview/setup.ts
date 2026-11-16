// 개발 서버와 npm start가 같은 방식으로 미리보기 저장소·음원을 준비한다.
import { join } from "node:path";
import type { PreviewDeps } from "../app.ts";
import { createRawAudio } from "./audio.ts";
import { previewAudioIds } from "./routes.ts";
import { createFileStore } from "./store.ts";

export function previewDeps(appRoot: string): PreviewDeps {
  return {
    store: createFileStore(join(appRoot, ".preview-data")),
    audio: createRawAudio(join(appRoot, "audio", "raw"), previewAudioIds()),
  };
}
