# 묶음으로 만든 연습 음원을 들어 보는 로컬 페이지(audio/raw/listen.html)를 만든다.
# 실행: python -X utf8 scripts/listen-page.py  (apps/learn에서)
import collections, glob, html, json, os

os.chdir(os.path.join(os.path.dirname(__file__), "..", "audio", "raw"))
KIND = {"pseudo": "의사단어", "stage0": "첫소리", "words": "단어", "sentences": "예문 · 말하듯이", "turns": "예문 · 또박또박"}
VOICES = ["erinome", "sulafat", "charon"]

def dur(path):
    try:
        return (os.path.getsize(path) - 44) / 48000
    except OSError:
        return 0

def text_of(audio_id):
    try:
        return json.load(open(f"{audio_id}.meta.json", encoding="utf-8")).get("text", audio_id)
    except OSError:
        return audio_id

by = collections.defaultdict(list)
for path in sorted(glob.glob("groups/*.meta.json")):
    meta = json.load(open(path, encoding="utf-8"))
    by[(meta["groupId"].split("-")[1], meta["kind"])].append((path[:-10] + ".wav", meta))

pilot = []
for path in glob.glob("*--erinome.meta.json"):
    meta = json.load(open(path, encoding="utf-8"))
    if (meta.get("group") or {}).get("source", "").startswith("pilot") or (meta.get("split") or {}).get("from", "").startswith("pilot"):
        pilot.append(meta)

out = [
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>묶음 생성 음원</title>',
    "<style>:root{--paper:#fefcf3;--ink:#262502;--olive:#4c4f2c;--muted:#5a5956;--line:#b6b4b2;--sage:#eeefde}"
    "body{font-family:'Noto Sans KR',sans-serif;background:var(--paper);color:var(--ink);max-width:960px;margin:24px auto;padding:0 16px}"
    "h1,h2{font-family:serif;color:var(--olive)}h2{margin-top:40px;border-bottom:2px solid var(--olive)}h3{margin:24px 0 6px}"
    "details{margin:6px 0 14px;background:var(--sage);padding:8px 12px}summary{cursor:pointer}table{border-collapse:collapse;width:100%}"
    "td{border-bottom:1px solid var(--line);padding:4px}audio{height:30px;width:100%}.m{color:var(--muted);font-size:13px}nav a{margin-right:12px;color:var(--olive)}</style>",
    '<h1>묶음 생성 음원</h1><p class="m">검수 전 초안. 묶음을 펼치면 통째 파일과 잘라 낸 조각을 들을 수 있어요.</p><nav>'
    + "".join(f'<a href="#{v}">{v.title()}</a>' for v in VOICES) + "</nav>",
]
for voice in VOICES:
    out.append(f'<h2 id="{voice}">{voice.title()}</h2>')
    found = False
    for kind, label in KIND.items():
        groups = by.get((voice, kind), [])
        if not groups:
            continue
        found = True
        count = sum(len(meta["items"]) for _, meta in groups)
        out.append(f'<h3>{label} <span class="m">· {len(groups)}묶음 · {count}개</span></h3>')
        for full, meta in groups:
            split = meta.get("split") or {}
            out.append(f'<details><summary>{html.escape(meta["groupId"])} <span class="m">· 자른 쉼 ≥ {split.get("shortestCutGapMs")}ms · 그 밖 ≤ {split.get("longestOtherGapMs")}ms</span></summary>')
            out.append(f'<p class="m">통째 파일</p><audio controls preload="none" src="{html.escape(full)}"></audio><table>')
            for item in meta["items"]:
                out.append(f'<tr><td style="width:45%">{html.escape(text_of(item))}</td><td class="m" style="width:10%">{dur(item + ".wav"):.2f}초</td><td><audio controls preload="none" src="{html.escape(item)}.wav"></audio></td></tr>')
            out.append("</table></details>")
    if voice == "erinome" and pilot:
        found = True
        out.append('<h3>시험에서 옮겨 온 것 <span class="m">· 의사단어·첫소리·칸 나눔 단어 10개</span></h3><details><summary>펼치기</summary><table>')
        for meta in sorted(pilot, key=lambda row: row["id"]):
            out.append(f'<tr><td style="width:45%">{html.escape(meta["text"])}</td><td class="m" style="width:10%">{dur(meta["id"] + ".wav"):.2f}초</td><td><audio controls preload="none" src="{html.escape(meta["id"])}.wav"></audio></td></tr>')
        out.append("</table></details>")
    if not found:
        out.append('<p class="m">아직 만들지 않았어요.</p>')
open("listen.html", "w", encoding="utf-8").write("\n".join(out))
print({f"{voice}/{kind}": len(groups) for (voice, kind), groups in sorted(by.items())})
