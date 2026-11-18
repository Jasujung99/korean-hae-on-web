// npm run build:cloud 가 빌드할 때 audio-manifest.json 으로 바꿔 끼운다(scripts/build-cloud.ts).
declare module "virtual:packed-audio-manifest" {
  const manifest: import("./packed-audio.ts").PackedAudioManifest;
  export default manifest;
}
