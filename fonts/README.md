# Worksheet Fonts

워크시트용 무료 폰트 파일을 여기에 넣습니다.

권장 파일 형식:

- `.ttf`
- `.otf`
- `.woff`
- `.woff2`

예시:

```text
fonts/
  handwriting-a.ttf
  handwriting-b.ttf
```

브라우저 미리보기에서 사용하려면 `worksheet-preview/styles.css` 상단에 `@font-face`를 추가합니다.

```css
@font-face {
  font-family: "WorksheetVowelA";
  src: url("/fonts/handwriting-a.ttf") format("truetype");
  font-display: swap;
}

@font-face {
  font-family: "WorksheetVowelB";
  src: url("/fonts/handwriting-b.ttf") format("truetype");
  font-display: swap;
}
```

그다음 모음 연습 글자에 적용할 수 있습니다.

```css
.sample-cell,
.cells span {
  font-family: "WorksheetVowelA", Pretendard, sans-serif;
}
```

두 가지 폰트를 한 페이지에서 같이 쓸 경우에는 CSS 클래스를 나눠 적용합니다.
