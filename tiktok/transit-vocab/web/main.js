const cues = await fetch(new URL("../cues.json", import.meta.url)).then((res) => res.json());

const stage = document.getElementById("stage");
const wash = document.getElementById("wash");
const wind = document.getElementById("wind");
const label = document.getElementById("section-label");
const bar = document.getElementById("progress-bar");
const track = bar.parentElement;

const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(name).trim();
const olive = token("--olive");
const paper = token("--paper");
const onOlive = token("--on-olive");

const WASH = {
  place: ["--wash-sage", 0.72],
  quizSubway: ["--wash-sage", 0.45],
  quizBus: ["--wash-sage", 0.45],
  quizAir: ["--wash-sage", 0.45],
  move: ["--wash-lavender", 0.7],
  stopEx: ["--wash-lavender", 0.4],
  viaEx: ["--wash-lavender", 0.4],
  stops: ["--wash-sage", 0.55],
  busStop: ["--wash-sage", 0.35],
  count: ["--wash-lavender", 0.4],
};

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function easeOut(t) {
  t = clamp(t);
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t) {
  t = clamp(t);
  const c = 1.35;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function sceneAt(t) {
  return cues.scenes.find((scene) => t >= scene.start && t < scene.end) ?? cues.scenes.at(-1);
}

const scenes = cues.scenes.map((scene) => {
  const el = document.getElementById(`scene-${scene.id}`);
  if (!el) throw new Error(`missing scene ${scene.id}`);
  return { ...scene, el };
});

function mountTimes() {
  for (const scene of scenes) {
    scene.el.querySelectorAll("[data-at]").forEach((el) => {
      el.dataset.enter = String(scene.start + Number(el.dataset.at));
    });
    scene.el.querySelectorAll("[data-pop-at]").forEach((el) => {
      el.dataset.pop = String(scene.start + Number(el.dataset.popAt));
    });
    scene.el.querySelectorAll("[data-rule-at]").forEach((el) => {
      el.dataset.rule = String(scene.start + Number(el.dataset.ruleAt));
    });
    scene.el.querySelectorAll("[data-on-at]").forEach((el) => {
      el.dataset.on = String(scene.start + Number(el.dataset.onAt));
    });
  }
}

function applyEnter(el, t) {
  const start = Number(el.dataset.enter);
  const u = easeOut((t - start) / 0.42);
  const rise = (1 - u) * 28;
  const blur = (1 - u) * 7;
  el.style.opacity = u.toFixed(3);
  el.style.transform = `translate3d(0, ${rise.toFixed(2)}px, 0)`;
  el.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : "none";
}

function applyPop(el, t) {
  const start = Number(el.dataset.pop);
  const u = easeOutBack((t - start) / 0.34);
  const fade = clamp((t - start) / 0.12);
  el.style.opacity = fade.toFixed(3);
  el.style.transform = `scale(${(0.72 + 0.28 * u).toFixed(3)})`;
}

function applyRule(el, t) {
  const u = easeOut((t - Number(el.dataset.rule)) / 0.45);
  el.style.transform = `scaleX(${u.toFixed(3)})`;
}

function applyDot(el, t) {
  const u = easeOut((t - Number(el.dataset.on)) / 0.32);
  el.style.background = u > 0.55 ? olive : paper;
  el.style.color = u > 0.55 ? onOlive : olive;
  el.style.transform = `scale(${(0.92 + 0.08 * Math.min(u, 1)).toFixed(3)})`;
}

function applyScene(scene, t) {
  const fadeIn = easeOut((t - scene.start) / 0.24);
  const fadeOut = easeOut((t - (scene.end - 0.22)) / 0.22);
  const opacity = fadeIn * (1 - fadeOut);
  scene.el.style.opacity = opacity.toFixed(3);
  scene.el.style.visibility = opacity < 0.012 ? "hidden" : "visible";
}

function applyWash(scene, t) {
  const spec = WASH[scene.id];
  if (!spec) {
    wash.style.opacity = "0";
    return;
  }
  const [name, amount] = spec;
  const u = easeOut((t - scene.start) / 0.35) * (1 - easeOut((t - (scene.end - 0.22)) / 0.22));
  wash.style.background = token(name);
  wash.style.opacity = (u * amount).toFixed(3);
}

function seek(t) {
  const scene = sceneAt(t);
  label.textContent = scene.label;
  label.style.opacity = easeOut((t - scene.start) / 0.2).toFixed(3);

  const full = track.clientWidth || 880;
  const width = 24 + (full - 24) * clamp(t / cues.duration);
  bar.style.width = `${width.toFixed(1)}px`;

  wind.style.transform = `translate3d(0, ${(Math.sin(t * 0.45) * 10).toFixed(2)}px, 0)`;

  for (const item of scenes) applyScene(item, t);
  applyWash(scene, t);

  stage.querySelectorAll("[data-enter]").forEach((el) => applyEnter(el, t));
  stage.querySelectorAll("[data-pop]").forEach((el) => applyPop(el, t));
  stage.querySelectorAll("[data-rule]").forEach((el) => applyRule(el, t));
  stage.querySelectorAll("[data-on]").forEach((el) => applyDot(el, t));
}

async function mountLogo() {
  const text = await fetch(new URL("../../../src/design-system/logos/logo-olive.svg", import.meta.url)).then((res) => res.text());
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  for (const id of ["mark", "name-ko", "name-en"]) {
    const d = doc.querySelector(`#${id}`)?.getAttribute("d");
    if (!d) throw new Error(`logo path #${id} missing`);
    document.getElementById(`${id}-path`).setAttribute("d", d);
  }
}

if (new URLSearchParams(location.search).has("debug")) document.body.classList.add("debug");

await document.fonts.ready;
await Promise.all([
  document.fonts.load("700 132px 'Noto Serif KR'"),
  document.fonts.load("600 84px 'Noto Serif KR'"),
  document.fonts.load("500 52px 'Noto Serif KR'"),
  document.fonts.load("300 26px 'Noto Sans KR'"),
  document.fonts.load("400 40px 'EB Garamond'"),
  document.fonts.load("italic 400 32px 'EB Garamond'"),
  document.fonts.load("500 48px 'EB Garamond'"),
  document.fonts.load("700 72px 'EB Garamond'"),
  document.fonts.load("400 42px 'Nanum Pen Script'"),
]);
await mountLogo();
mountTimes();
window.__cues = cues;
window.seek = seek;
seek(0);
window.__ready = true;
