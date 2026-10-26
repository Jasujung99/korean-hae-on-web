# 해온 haeon 웹사이트

해온 누리집의 Astro 정적 사이트입니다. 지금은 2026년 11월 20일 정식 오픈 전까지 보여 줄 오픈 예정 화면 한 장만 있습니다. 화면과 글은 새 디자인 시스템([src/design-system/](src/design-system/README.md))을 따릅니다.

## 실행

```powershell
npm install
npm run dev
```

- 개발 서버: `http://localhost:4321`
- 정적 빌드 및 검증: `npm run build`
- 빌드 결과: `dist/`

## 배포

`main`에 푸시하면 GitHub Actions(`.github/workflows/hostinger-deploy.yml`)가 사이트를 빌드해 `dist/`를 `deploy` 브랜치에 올립니다. Hostinger Git 배포는 이 `deploy` 브랜치를 바라보게 설정합니다. 실제 배포 산출물은 저장소 루트가 아니라 `dist/`입니다.

주의: 루트의 `index.html`은 오래된 정적 미리보기 파일입니다. `haeonkorean.com` 배포 확인용 파일이 아닙니다.

배포 후 확인:

- `https://haeonkorean.com/`에서 ‘11월 20일에 만나요’ 자모 조각이 날아와 모이는지 확인합니다.
- 옛 주소(예: `https://haeonkorean.com/classes/`)가 첫 화면으로 넘어가는지 확인합니다.
- `https://haeonkorean.com/sitemap-index.xml`이 열리는지 확인합니다.
- 브라우저 캐시 또는 Hostinger 캐시가 남아 있으면 캐시를 비우고 다시 확인합니다.

자세한 절차는 [docs/deployment-hostinger.md](docs/deployment-hostinger.md)를 참고하세요.

## 주소

| 경로 | 역할 | 검색 노출 |
| --- | --- | --- |
| `/` | 오픈 예정 화면 | 허용 |
| `/start/`, `/classes/`, `/study-kits/`, `/contact/`, `/events/free-pronunciation-coaching/`, `/thanks/coaching/`, `/thanks/inquiry/`, `/privacy/`, `/terms/`, `/refund/` | 옛 주소. 정식 오픈 전까지 `/`로 넘긴다 ([scripts/redirects.mjs](scripts/redirects.mjs)) | 제외 |
| `/share/…` | 수업 자료 공유 파일 | 그대로 |

## 설정

- `SITE_URL`: 실제 도메인. canonical URL, sitemap, 미리보기 이미지 주소가 이 값으로 만들어집니다. 배포 워크플로가 `https://haeonkorean.com`으로 넣습니다.
- 링크: [src/lib/site.ts](src/lib/site.ts)의 `links`에 Threads 주소(`threads`)와 편지 받기 주소(`letters`)를 넣습니다. Threads 주소가 비어 있으면 첫 화면에서 그 링크를 감춥니다.
- 미리보기 이미지: `public/og.png`는 오픈 예정 화면을 1200×630으로 찍은 것입니다. 화면을 바꾸면 다시 찍어 넣습니다.

## 옛 사이트

옛 디자인 시스템은 [old-design-system/](old-design-system/)에, 오픈 예정 화면으로 바꾸기 전의 사이트 파일(페이지, 컴포넌트, 스타일, 이미지, 설정, 빌드 검사, 문서)은 [old-site/](old-site/)에 그대로 남겨 두었습니다. 둘 다 빌드에는 들어가지 않습니다.
