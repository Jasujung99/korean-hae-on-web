# HAEON Worksheet Preview

브라우저에서 A4 워크시트를 바로 보면서 수정하는 미리보기입니다.

## 실시간 미리보기

```powershell
node .\worksheet-preview\preview-server.js
```

브라우저에서 열기:

```text
http://localhost:5173/
```

`worksheet-preview/index.html`, `worksheet-preview/styles.css`, `resources`, `assets` 안의 파일을 수정하면 브라우저가 자동 새로고침됩니다.

## PDF로 저장

가장 간단한 방법:

1. 미리보기 페이지에서 `Print PDF` 버튼을 누릅니다.
2. 프린터를 `Save as PDF` 또는 `Microsoft Print to PDF`로 선택합니다.
3. 용지는 A4, 배율은 100%, 여백은 없음으로 둡니다.
4. 배경 그래픽 옵션을 켭니다.

브라우저 주소창에서 직접 인쇄해도 됩니다.

```text
http://localhost:5173/
```

명령어로 바로 출력하려면 미리보기 서버를 켠 상태에서 실행합니다.

```powershell
.\worksheet-preview\export-pdf.ps1
```

출력 위치:

```text
output/pdf/hangeul_worksheet_preview.pdf
```

## 수정 위치

- 레이아웃과 문구: `worksheet-preview/index.html`
- 크기, 색, 위치: `worksheet-preview/styles.css`
- 로고: `resources/haeon-logo-pdf.png`
- 하단 물결: `resources/worksheet-footer-wave-minimal.png`
