import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const here = path.dirname(fileURLToPath(import.meta.url));
const cues = JSON.parse(await readFile(path.join(here, "cues.json"), "utf8"));
const { fps, duration, width, height } = cues;

const args = process.argv.slice(2);
const atFlag = args.indexOf("--at");
const stills = atFlag >= 0 ? args[atFlag + 1].split(",").map(Number) : null;
const skipVideo = args.includes("--stills-only");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

const framesDir = path.join(here, "out", "frames");
const stillDir = path.join(here, "out", "stills");
await mkdir(framesDir, { recursive: true });
await mkdir(stillDir, { recursive: true });

const server = await startServer();
const port = server.address().port;
const pageUrl = `http://127.0.0.1:${port}/tiktok/transit-vocab/web/index.html`;

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--font-render-hinting=none",
    "--force-color-profile=srgb",
    "--disable-gpu",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
page.on("pageerror", (error) => console.error("pageerror", error));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("console", msg.text());
});
await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });

const times = stills ?? Array.from({ length: Math.round(duration * fps) }, (_, index) => index / fps);
const started = Date.now();

for (let index = 0; index < times.length; index += 1) {
  const t = times[index];
  await page.evaluate((time) => window.seek(time), t);
  if (stills) {
    const name = `t_${String(t).replace(".", "_")}.png`;
    await page.screenshot({ path: path.join(stillDir, name), type: "png" });
    console.log("still", name);
  } else {
    const name = `f_${String(index).padStart(5, "0")}.jpg`;
    await page.screenshot({ path: path.join(framesDir, name), type: "jpeg", quality: 94 });
    if (index % 60 === 0) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`frame ${index + 1}/${times.length}  t=${t.toFixed(2)}  ${elapsed}s`);
    }
  }
}

await browser.close();
server.close();

if (stills || skipVideo) process.exit(0);

const mix = path.join(here, "out", "mix.wav");
if (!existsSync(mix)) throw new Error("missing out/mix.wav — run audio/compose_audio.py first");

const video = path.join(here, "out", "haeon-transit-vocab.mp4");
await run("ffmpeg", [
  "-y",
  "-framerate",
  String(fps),
  "-i",
  path.join(framesDir, "f_%05d.jpg"),
  "-i",
  mix,
  "-t",
  String(duration),
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "17",
  "-preset",
  "medium",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  "-shortest",
  video,
]);

const stillTimes = [1.15, 5.4, 10.2, 14.2, 17.6, 21.0, 25.2, 29.6, 34.0, 38.6, 43.0, 47.4, 55.2, 63.2];
for (const t of stillTimes) {
  const name = `frame_${String(t).replace(".", "_")}.png`;
  await run("ffmpeg", [
    "-y",
    "-ss",
    String(t),
    "-i",
    video,
    "-frames:v",
    "1",
    "-update",
    "1",
    path.join(stillDir, name),
  ]);
}

const meta = {
  file: video,
  duration,
  fps,
  frames: times.length,
  width,
  height,
};
await writeFile(path.join(here, "out", "render-meta.json"), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
