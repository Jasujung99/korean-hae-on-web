# Hostinger 배포 체크리스트

## 현재 증상

`haeonkorean.com`에서 푸시한 수정사항이 보이지 않는다면 가장 가능성이 높은 원인은 Hostinger가 Astro 빌드 결과인 `dist/`가 아니라 저장소 루트의 `index.html`을 서빙하고 있는 것입니다.

이 저장소의 루트 `index.html`은 오래된 정적 미리보기 파일입니다. 실제 사이트는 `src/`를 기준으로 `npm run build`를 실행한 뒤 생성되는 `dist/` 파일을 배포해야 합니다.

## 권장 설정

Hostinger Git 배포에서 빌드 명령을 지정할 수 있다면 다음처럼 설정합니다.

```text
Install command: npm install
Build command: npm run build
Publish directory: dist
```

환경 변수에는 최소한 다음 값을 설정합니다.

```text
SITE_URL=https://haeonkorean.com
```

문의 폼, 결제, GA4를 실제 운영에 연결하려면 `.env.example`의 `PUBLIC_*` 값을 Hostinger 환경 변수에도 동일하게 넣습니다.

## 빌드 명령을 지정할 수 없는 경우

Hostinger가 저장소를 그대로 `public_html`에 배포하는 방식이라면 Git push만으로는 최신 Astro 사이트가 반영되지 않습니다.

이 경우 로컬에서 다음 명령을 실행합니다.

```powershell
npm install
$env:SITE_URL="https://haeonkorean.com"
npm run build
```

그 다음 `dist/` 폴더 안의 파일과 폴더를 Hostinger의 `public_html`에 업로드합니다. `dist` 폴더 자체를 올리는 것이 아니라, `dist/index.html`, `dist/_astro/`, `dist/sitemap-index.xml` 등이 `public_html` 바로 아래에 오도록 배치해야 합니다.

## 배포 확인

배포 후 다음을 확인합니다.

- `https://haeonkorean.com/`에서 ‘11월 20일에 만나요’ 자모 조각이 날아와 모이고, 왼쪽 위에 새싹 표식과 해온 로고가 보입니다.
- `https://haeonkorean.com/classes/`처럼 옛 주소로 들어가면 첫 화면으로 넘어갑니다.
- `https://haeonkorean.com/sitemap-index.xml`이 열립니다.
- 캐시 때문에 이전 화면이 보이면 Hostinger 캐시와 브라우저 캐시를 비운 뒤 다시 확인합니다.

## 로컬 검증 명령

```powershell
npm run build
npm run preview
```

`npm run build`는 Astro 타입 체크, 정적 빌드, 필수 라우트 검증을 함께 실행합니다.
