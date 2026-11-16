#!/usr/bin/env python3
"""개발 1단계 화면 스크린샷 + 가로 넘침 검사 (로컬 검토용 도구).

필요: Python playwright 와 Chromium 계열 브라우저.
  python3 scripts/capture-screens.py --base http://localhost:4400 --out /tmp/shots [--chrome /usr/bin/google-chrome]
폭 1280x800, 390x844, 320x700 에서 각 화면을 찍고, scrollWidth > clientWidth 이거나
뷰포트 밖으로 나간 요소가 있으면 실패(종료 코드 1)로 보고한다.
"""
import argparse, json, os, sys
from playwright.sync_api import sync_playwright

SCREENS = [
    ("01-common-entry", "/"),
    ("02-join-invite", "/join#token=example-not-a-real-token"),
    ("03-practice-quiz", "/practice"),
    ("04-practice-compare-abx", "/practice/compare"),
    ("05-practice-finish", "/practice/finish"),
    ("06-words-extension", "/words"),
    ("07-teacher-list", "/teacher"),
    ("08-teacher-detail", "/teacher/learners/preview"),
]
VIEWPORTS = [("pc-1280x800", 1280, 800), ("mobile-390x844", 390, 844), ("mobile-320x700", 320, 700)]

OVERFLOW_JS = """() => {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
    if (el.closest('.visually-hidden')) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) offenders.push((el.tagName + '.' + el.className).slice(0, 80) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
  }
  return { scrollWidth: doc.scrollWidth, bodyScrollWidth: document.body.scrollWidth, clientWidth: vw, offenders: offenders.slice(0, 10), hash: location.hash };
}"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:4400")
    ap.add_argument("--out", required=True)
    ap.add_argument("--chrome", default=os.environ.get("CHROME_PATH"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    report, failed = [], False
    with sync_playwright() as p:
        kw = {"executable_path": a.chrome} if a.chrome else {}
        browser = p.chromium.launch(**kw)
        for vname, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            for sname, path in SCREENS:
                page.goto(a.base + path, wait_until="networkidle")
                page.wait_for_timeout(300)
                m = page.evaluate(OVERFLOW_JS)
                over = m["scrollWidth"] > m["clientWidth"] or m["bodyScrollWidth"] > m["clientWidth"] or bool(m["offenders"])
                failed |= over
                fn = os.path.join(a.out, f"{sname}--{vname}.png")
                page.screenshot(path=fn, full_page=True)
                report.append({"screen": sname, "viewport": vname, "file": fn, "overflow": over, **m})
            if errors:
                failed = True
                report.append({"viewport": vname, "pageErrors": errors})
            ctx.close()
        browser.close()
    with open(os.path.join(a.out, "overflow-report.json"), "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    for r in report:
        if "screen" in r:
            print(f"{'FAIL' if r['overflow'] else 'ok  '} {r['viewport']:16} {r['screen']:26} scroll={r['scrollWidth']} client={r['clientWidth']} {r['offenders'][:2] if r['offenders'] else ''}")
        else:
            print("PAGE ERRORS", r)
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
