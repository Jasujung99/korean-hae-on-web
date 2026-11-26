"""Synthesize the short Korean cues with Ppaso-TTS (Apache-2.0).

The model is downloaded into .cache/ and is not committed. The wav files in
audio/voices/ are the words and one short phrase used in the video.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "ppaso"
VOICES = ROOT / "audio" / "voices"
CUES = json.loads((ROOT / "cues.json").read_text(encoding="utf-8"))
SR = 22050


def trim(wav: np.ndarray) -> np.ndarray:
    threshold = 0.012
    hits = np.where(np.abs(wav) > threshold)[0]
    if len(hits) == 0:
        return wav
    start = max(0, int(hits[0]) - int(0.02 * SR))
    end = min(len(wav), int(hits[-1]) + int(0.06 * SR))
    wav = wav[start:end].astype(np.float32)
    fade_in = int(0.012 * SR)
    fade_out = int(0.04 * SR)
    if len(wav) > fade_in + fade_out:
        wav[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
        wav[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
    peak = float(np.max(np.abs(wav))) or 1.0
    return wav / peak * 0.9


def main() -> None:
    sys.path.insert(0, str(CACHE / "example"))
    from ppaso_tts import PpasoTTS

    if not (CACHE / "config.json").exists():
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="akamotaco/ppaso-tts-v1",
            local_dir=str(CACHE),
            allow_patterns=[
                "onnx/*",
                "runtime/**",
                "example/ppaso_tts.py",
                "config.json",
                "LICENSE",
                "README.md",
            ],
        )

    tts = PpasoTTS(CACHE, backend="onnx", device="cpu")
    VOICES.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    for cue in CUES["tts"]:
        if cue["id"] in seen:
            continue
        seen.add(cue["id"])
        phones = " ".join(tts._g2p(cue["text"]))
        wav = trim(tts.synthesize(cue["text"], chunked=False))
        dest = VOICES / f"{cue['id']}.wav"
        sf.write(dest, wav, SR)
        print(f"{cue['id']}\t{len(wav) / SR:.2f}s\t{cue['text']}\t{phones}")


if __name__ == "__main__":
    main()
