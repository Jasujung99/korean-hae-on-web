# HAEON Design System

이 폴더는 HAEON 웹사이트와 PDF 학습지를 같은 브랜드 기준으로 묶기 위한 소형 디자인 시스템입니다.

## Current Direction

- Palette: `Deep Navy #102B4E`, `Clear Blue #5D9DE8`, `Water Mint #73D2CB`, `Mist #EAF6FA`, `White #FFFFFF`, `Coral Signal #FF7868`
- Type: 큰 한글 제목은 `Haeon Display`, 본문과 UI는 `Haeon Sans`
- Shape: 버튼은 pill, 카드와 미디어 컨테이너는 soft radius
- Density: 시안 8번을 기준으로 제목과 요소 크기를 줄이고 여백을 넓힘

## Structure

```text
design-system/
├─ fonts/
├─ tokens/
│  ├─ primitives.css
│  ├─ semantic.web.css
│  └─ semantic.print.css
├─ foundations/
│  ├─ fonts.css
│  └─ base.css
├─ components/
│  ├─ button.css
│  └─ card.css
└─ patterns/
   └─ water.css
```

## Token Rule

Primitive tokens describe raw values. Semantic tokens describe roles.

```css
--haeon-blue-500: #5d9de8;
--color-highlight: var(--haeon-blue-500);
```

Component CSS should use semantic tokens first. Primitive tokens are reserved for defining the system.
