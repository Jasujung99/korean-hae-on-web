"""Original music and effects, mixed with the Korean word cues.

Music and sound effects are synthesized in this file (no third-party
recording). Korean speech comes from audio/voices/, made by tts_korean.py.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
CUES = json.loads((ROOT / "cues.json").read_text(encoding="utf-8"))
SR = 48000
DURATION = float(CUES["duration"])
N = int(round(DURATION * SR))
RNG = np.random.default_rng(7)


def scene_start(scene_id: str) -> float:
    for scene in CUES["scenes"]:
        if scene["id"] == scene_id:
            return float(scene["start"])
    raise KeyError(scene_id)


def midi_freq(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def pluck(freq: float, dur: float, amp: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.zeros(n, dtype=np.float64)
    for partial, gain in ((1, 1.0), (2, 0.42), (3, 0.18), (4.003, 0.07)):
        tone += gain * np.sin(2 * np.pi * freq * partial * t)
    attack = np.minimum(1.0, t / 0.007)
    env = np.exp(-3.6 * t) * attack
    return tone * env * amp


def add(buf: np.ndarray, clip: np.ndarray, at: float, pan: float = 0.0) -> None:
    start = int(round(at * SR))
    if start >= len(buf):
        return
    end = min(len(buf), start + len(clip))
    piece = clip[: end - start]
    left = piece * (1 - pan) * 0.5
    right = piece * (1 + pan) * 0.5
    if left.ndim == 1:
        buf[start:end, 0] += left
        buf[start:end, 1] += right


def resample(wav: np.ndarray, src_sr: int) -> np.ndarray:
    if src_sr == SR:
        return wav.astype(np.float64)
    n = int(round(len(wav) * SR / src_sr))
    x_old = np.linspace(0, 1, len(wav), endpoint=False)
    x_new = np.linspace(0, 1, n, endpoint=False)
    return np.interp(x_new, x_old, wav).astype(np.float64)


def band_noise(dur: float, f0: float, f1: float, seed: int) -> np.ndarray:
    n = int(dur * SR)
    noise = np.random.default_rng(seed).normal(0, 1, n)
    spec = np.fft.rfft(noise)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec *= (freqs >= f0) & (freqs <= f1)
    y = np.fft.irfft(spec, n)
    peak = np.max(np.abs(y)) or 1
    return y / peak


def music() -> np.ndarray:
    buf = np.zeros((N, 2), dtype=np.float64)
    t = np.arange(N) / SR
    # Quiet paper drone in F, with a slow breath.
    breath = 0.65 + 0.35 * np.sin(2 * np.pi * 0.045 * t)
    for freq, amp in ((midi_freq(41), 0.045), (midi_freq(53), 0.03), (midi_freq(60), 0.018)):
        tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 1.003 * t)
        buf[:, 0] += tone * breath * amp
        buf[:, 1] += tone * breath * amp

    beat = 60 / 70
    phrase = [
        (0, 65, 0.16),
        (2, 69, 0.14),
        (4, 72, 0.12),
        (7, 69, 0.11),
        (8, 67, 0.13),
        (10, 65, 0.14),
        (12, 74, 0.10),
        (14.5, 72, 0.09),
    ]
    loop = 16 * beat
    start = 0.4
    index = 0
    while start < DURATION - 0.8:
        for step, note, amp in phrase:
            when = start + step * beat + float(RNG.uniform(-0.012, 0.012))
            pan = -0.18 if index % 2 == 0 else 0.18
            add(buf, pluck(midi_freq(note), 1.35, amp), when, pan)
            index += 1
        start += loop

    # Soft air, high enough to keep the encode from pumping on silence.
    air = band_noise(DURATION, 500, 4000, 11) * 0.012
    env = np.linspace(0, 1, int(0.6 * SR))
    air[: len(env)] *= env
    buf[:, 0] += air
    buf[:, 1] += air
    return buf


def effects() -> np.ndarray:
    buf = np.zeros((N, 2), dtype=np.float64)
    tap = band_noise(0.07, 900, 2800, 3)
    tap *= np.exp(-28 * np.arange(len(tap)) / SR) * 0.22
    tick_t = np.arange(int(0.09 * SR)) / SR
    tick = np.sin(2 * np.pi * 880 * tick_t) * np.exp(-26 * tick_t) * 0.16
    whoosh = band_noise(0.32, 280, 1800, 5)
    whoosh *= np.sin(np.linspace(0, np.pi, len(whoosh))) ** 1.3 * 0.12

    hook = scene_start("hook")
    add(buf, tap, hook + 0.08, -0.1)
    add(buf, tap, hook + 0.68, 0.1)
    for scene_id in ("place", "move", "stops", "recall", "end"):
        add(buf, whoosh, scene_start(scene_id), 0.0)
    for scene_id in ("quizSubway", "quizBus", "quizAir"):
        add(buf, tick, scene_start(scene_id) + 0.26, 0.05)
    return buf


def speech() -> tuple[np.ndarray, np.ndarray]:
    buf = np.zeros(N, dtype=np.float64)
    duck = np.ones(N, dtype=np.float64)
    for cue in CUES["tts"]:
        path = ROOT / "audio" / "voices" / f"{cue['id']}.wav"
        wav, src_sr = sf.read(path, dtype="float64")
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        clip = resample(wav, int(src_sr))
        at = scene_start(cue["scene"]) + float(cue["at"])
        start = int(round(at * SR))
        end = min(N, start + len(clip))
        if start >= N:
            continue
        buf[start:end] += clip[: end - start] * 0.62
        # Ease the bed down just around the word.
        edge = int(0.08 * SR)
        a = max(0, start - edge)
        b = min(N, end + edge)
        window = np.ones(b - a)
        ramp = np.linspace(0, 1, edge)
        if a + edge <= start:
            window[:edge] = 1 - 0.62 * ramp
        window[edge : edge + (end - start)] = 0.38
        tail = b - end
        if tail > 0:
            window[-tail:] = 0.38 + 0.62 * np.linspace(0, 1, tail)
        duck[a:b] = np.minimum(duck[a:b], window)
    return buf, duck


def fade(buf: np.ndarray) -> None:
    inn = int(0.35 * SR)
    out = int(2.4 * SR)
    buf[:inn] *= np.linspace(0, 1, inn)[:, None]
    buf[-out:] *= np.linspace(1, 0, out)[:, None]


def main() -> None:
    bed = music() * 2.35 + effects()
    voice, duck = speech()
    bed *= duck[:, None]
    mix = bed
    mix[:, 0] += voice
    mix[:, 1] += voice
    fade(mix)
    peak = float(np.max(np.abs(mix))) or 1.0
    if peak > 0.98:
        mix *= 0.98 / peak
    out = ROOT / "out"
    out.mkdir(parents=True, exist_ok=True)
    dest = out / "mix.wav"
    sf.write(dest, mix.astype(np.float32), SR)
    rms = float(np.sqrt(np.mean(mix**2)))
    print(f"wrote {dest}  {DURATION:.2f}s  peak {np.max(np.abs(mix)):.3f}  rms {rms:.3f}")


if __name__ == "__main__":
    main()
