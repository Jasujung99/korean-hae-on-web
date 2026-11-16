# ADR 0001. 화면은 Vite·React, 서버는 Node의 Hono

상태: 개발 1단계에서 채택. 2026-11-16.

## 맥락

성인 학습 앱은 `apps/learn` 패키지로 두고, 루트 Astro 정적 사이트와 배포를 바꾸지 않아야 한다. 이후 단계의 기기 세션은 서버가 검증하는 HttpOnly 쿠키이고, 브라우저의 `/api/*`는 화면과 같은 origin이어야 한다. 다른 origin을 쓰면 쿠키·CSRF·CORS를 이 결정에서 다시 검토해야 한다.

확인한 실행 환경은 이렇다.

- 루트 앱은 Astro 정적 출력이다. `npm run build`는 `astro check && astro build && node scripts/check-build.mjs`이고 결과는 루트 `dist/`다.
- `.github/workflows/hostinger-deploy.yml`은 `main` 푸시에서 Node 24로 `npm ci`, `npm run build`를 실행하고 `./dist`만 `deploy` 브랜치에 올린다. Hostinger는 그 정적 브랜치를 배포한다.
- 이 개발 환경의 Node는 22.23.4다. 학습 패키지는 Node 22와 24에서 같은 소스 명령으로 동작하도록 두고, Node 24 전용 API는 쓰지 않는다.
- 루트 `package.json`에는 workspaces가 없다. AGENTS.md는 없다.

## 결정

`apps/learn`은 자체 `package.json`과 `package-lock.json`을 가진다. 루트 workspaces에는 넣지 않는다. 루트 `npm ci`가 이 패키지를 설치하면 lockfile과 배포 설치 범위가 바뀐다.

화면은 Vite와 React다. 서버는 Hono를 Node에서 실행한다.

- 개발: `npm run dev`는 Vite 개발 서버(127.0.0.1:4174)이고, `/api/*`와 `/robots.txt`는 `@hono/node-server`의 `getRequestListener`가 응답한다. 개발과 프로덕션이 POST 본문과 `Set-Cookie`를 같이 다룬다.
- 빌드: `npm run build`는 앱의 `tsconfig.json`만 검사한 뒤 클라이언트를 `apps/learn/dist/client`에 만들고, esbuild도 그 tsconfig로 서버 엔트리를 `apps/learn/dist/server/index.js`에 묶는다.
- 실행: `npm start`는 `node dist/server/index.js`다. `HOST`와 `PORT`로 묶고, 정적 파일과 `/api/*`를 함께 제공한다.
- 검사: `npm test`, `npm run typecheck`, `npm run test:smoke`, `npm run verify:clean`.

Vite와 Vitest에는 `tsconfig: "./tsconfig.json"`을 고정했다. 서버 테스트가 루트 Astro `tsconfig.json`(`astro/tsconfigs/strict`)을 읽지 않게 하기 위해서다. 루트 `node_modules`가 없어도 이 패키지의 `npm ci`로 검사할 수 있다.

같은 origin이므로 이 단계에서는 CORS 헤더를 보내지 않는다. `GET`/`HEAD`/`OPTIONS`가 아닌 `/api/*`는 `Origin`이 `LEARN_APP_ORIGIN`과 같을 때만 통과하고, 본문은 `application/json`만 받는다. 세션 쿠키는 아직 발급하지 않는다. 개발 4단계의 기기 세션은 이 서버에서 `HttpOnly; SameSite=Lax; Path=/`로 발급한다. 운영 HTTPS에서는 `Secure`와 `__Host-` 접두사를 쓸 수 있다. 로컬 HTTP에서는 `Secure`를 켜지 않는다. 그 구분은 세션을 구현할 때 서버 설정으로 나눈다.

`LEARN_APP_ORIGIN`은 화면에 보여주는 설정값이다. 값이 있어도 활성화·DNS 변경으로 보고하지 않는다. `learn.haeonkorean.com`은 제안 이름일 뿐이라 코드와 기본 환경 값에 넣지 않는다.

디자인은 루트 `src/design-system/tokens.css`, `base.css`와 `logos/logo-olive.svg`를 어댑터에서 직접 불러온다. 색 값을 앱 안에 복사하지 않는다. 상태 색은 olive, ink, wash-sage, wash-lavender만 쓴다.

## 대안

- 루트 Astro에 Node 어댑터를 붙이는 안. 정적 본사이트 빌드와 학습 서버가 한 명령으로 묶이고, 현재 Hostinger 배포도 서버를 실행하지 못한다.
- Next.js. 쿠키와 라우트 핸들러는 편하지만 프레임워크가 크고, 지금 Hostinger의 정적 `deploy` 브랜치에는 마찬가지로 올릴 수 없다.
- 화면과 API를 다른 origin으로 나누는 안. 이후 HttpOnly 세션에 CORS와 CSRF를 다시 설계해야 해서 지금 계약과 어긋난다.
- 토큰 CSS를 `apps/learn`에 복사하는 안. 디자인 원본과 곧 달라진다.

## 호스팅

현재 Hostinger 경로는 정적 파일만 받는다. 이 서버는 그 경로로 배포하지 않는다. 나중에 학습 앱을 열려면 루트 `dist/`와 분리된 Node 프로세스가 필요하고, 도메인·DNS·TLS·쿠키 도메인은 그때 정한다. 이 ADR은 그 변경을 수행하지 않는다.

## 명령

```sh
cd apps/learn
npm ci
npm test
npm run typecheck
npm run build
npm run dev
npm start
npm run test:smoke
npm run verify:clean
```

루트 사이트 확인은 저장소 루트에서 `npm ci && npm run build`다. 그 명령은 이 패키지를 빌드하지 않는다.
