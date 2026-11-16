# ADR 0001. 학습 앱 프레임워크·서버 런타임·패키지 경계

- 상태: 채택 (개발 1단계, 로컬 검토용)
- 날짜: 2026-11-16
- 기준: `codex/adult-phoneme-development-handoff` @ `7423ed3` (main `d293820` + 인계 문서)
- 관련 문서: `docs/adult-phoneme-app/02-invitation-and-device-session.md`, `03-implementation-stages.md`, `04-data-and-api-contracts.md`

## 확인한 실제 환경

| 항목 | 값 |
|---|---|
| 본사이트 | Astro `^7.0.8`(lock 7.0.8) 정적 출력, `@astrojs/sitemap`, TypeScript 5.9 |
| 루트 명령 | `npm ci` → `npm run build` = `astro check && astro build && node scripts/check-build.mjs` |
| 배포 | `.github/workflows/hostinger-deploy.yml`: `main` push → Node 24, `npm ci`, `npm run build` → `dist/`를 `deploy` 브랜치에 게시 → Hostinger가 정적 파일 서비스 |
| 로컬 런타임 | Node v24.22.1, npm 11.21.1 (CI와 같은 Node 24 계열) |
| AGENTS.md | 없음 |
| 루트 workspaces | 없음 (`package.json`에 `workspaces` 필드 없음) |

현재 운영 경로는 **정적 파일만** 서비스한다. 서버 API·쿠키 발급은 지금 배포 구조에서 실행되지 않는다.

## 이후 단계가 요구하는 것

1. 서버가 검증하는 불투명 기기 세션과 `HttpOnly; Secure; SameSite=Lax; Path=/` 쿠키(운영은 `__Host-` 가능).
2. 브라우저 관점의 같은 origin `/api/*` (초대 inspect/claim, 학습자·교사 API).
3. 상태 변경 요청의 Origin 검사·CSRF 방어·JSON 전용, CORS `*` 금지.
4. Supabase 서버 측 접근(서버 키는 서버 환경 변수에서만), 요청별 권한·범위 검사.
5. 키·DB 없이도 개발 화면이 뜰 것. 해온 디자인 시스템(`src/design-system`)을 그대로 쓸 것.

## 결정

**Astro 7 서버 출력(`output: "server"`) + `@astrojs/node` standalone 어댑터(Node 24)를 쓰는 독립 패키지 `apps/learn/`.**

- 페이지와 `/api/*` 엔드포인트가 **한 Node 프로세스, 한 origin**에서 나온다. 프록시 없이 같은 origin 쿠키·CSRF 설계를 그대로 쓸 수 있다.
- `src/middleware.ts`에서 모든 요청에 공통 검사(현재: `/api/*` 상태 변경 요청의 Origin 일치·JSON 전용, noindex·프레임 금지 헤더)를 건다. 개발 4단계의 세션 조회도 여기에 붙인다. Astro 기본 `security.checkOrigin`(폼 POST 차단)도 켜 둔다.
- 쿠키는 Astro `cookies` API(`httpOnly`, `secure`, `sameSite`)로 서버에서만 발급한다. 세션 저장소는 Astro 내장 sessions가 아니라 계약대로 DB의 `phoneme_device_sessions`(토큰 해시)로 한다.
- 서버 전용 값은 `process.env`로 서버 코드에서만 읽는다. `PUBLIC_` 접두사 변수만 브라우저 번들에 들어가므로 비밀값에 그 접두사를 쓰지 않는다.
- 본사이트와 **같은 프레임워크**라 `.astro` 문법·디자인 시스템 사용법(`logo-olive.svg?raw`에서 경로 추출, `tokens.css`/`base.css` 직접 import)을 그대로 쓴다. 토큰은 복사하지 않고 루트 원본을 import하며, 학습 앱 의미 이름은 `src/styles/haeon-adapter.css`에서만 연결한다.
- 퀴즈 상태·outbox 같은 상호작용(개발 5단계)은 Astro island로 붙인다. 기본 후보는 React(`@astrojs/react`, Boa_newwords 패턴 재사용)이며 그 단계에서 확정한다. 1단계에는 설치하지 않았다.

### 패키지 경계 (루트 workspaces를 쓰지 않는 이유)

- `apps/learn`은 **자체 `package.json`과 `package-lock.json`**을 가진다. 루트 `package.json`에 `workspaces`를 추가하지 않는다.
- 루트에 workspaces를 넣으면 루트 lockfile이 바뀌고, 운영 배포 workflow의 루트 `npm ci`가 학습 앱 의존성(astro 7.4·node 어댑터 등)까지 설치·호이스팅하게 된다. `@astrojs/node`는 `astro ^7.2.1`을 요구하지만 본사이트 lock은 7.0.8이라 버전 충돌·본사이트 동작 변경 위험이 있다.
- 루트 `tsconfig.json`은 `src/**`만 포함하고, 루트 `astro check`는 같은 12개 파일만 검사한다(전·후 동일). 루트 `dist/`도 전·후 sha256이 같다.
- 학습 앱은 루트 `node_modules` 없이 혼자 설치·빌드된다. Vite 8(rolldown)의 tsconfig 자동 탐색이 루트 `tsconfig.json`(`astro/tsconfigs/strict` 상속)에 닿으면 루트 의존성 없이는 빌드가 실패하므로, `astro.config.mjs`의 `vite.tsconfig`를 앱 `tsconfig.json`으로 고정했다. `npm run verify:clean`이 HEAD를 임시 폴더에 풀어 이 조건을 다시 확인한다.
- 디자인 시스템만 상대 경로(`../../src/design-system`)로 읽는다. 이를 위해 Vite `server.fs.allow`에 그 폴더만 추가했다. 학습 앱을 배포할 때는 저장소 전체(최소 `src/design-system/` 포함)를 빌드 컨텍스트로 쓴다.

## 검토한 대안

| 대안 | 판단 |
|---|---|
| Vite + React SPA + 별도 API 서버(Hono/Express) | Boa와 비슷하지만 프로세스·포트가 둘이고, 같은 origin을 위해 개발·운영 모두 프록시가 필요하다. 본사이트 디자인 시스템(.astro)과 문법이 갈린다. |
| Next.js | 같은 origin API·쿠키는 가능하나 본사이트와 다른 큰 프레임워크이고, 운영 형태가 특정 호스팅에 기울기 쉽다. 1단계 필요 대비 무겁다. |
| 정적 SPA + Supabase Edge Functions | API가 `*.supabase.co` 다른 origin이 되어 HttpOnly 쿠키가 제3자 쿠키·CORS 문제로 바뀐다. 문서의 같은 origin 기본값과 맞지 않는다. |
| Astro + Cloudflare 어댑터(Workers) | 어휘 서비스가 Cloudflare Pages라 운영 후보로는 의미가 있다. 다만 로컬 런타임(workerd)·Node API 차이가 있어 1단계 기본값으로는 Node를 택했다. 어댑터 교체는 `astro.config.mjs` 한 곳에 국한된다. |
| 본사이트 Astro 프로젝트에 학습 앱 페이지 추가 | 본사이트는 정적 출력이고 `main` push가 곧 운영 배포다. 서버 출력으로 바꾸면 Hostinger 정적 배포가 깨진다. 지시서도 금지한다. |

## 호스팅에 미치는 영향 (결정하지 않음)

현재 Hostinger 배포(`deploy` 브랜치의 정적 파일)로는 이 앱의 서버 부분을 운영할 수 없다. 운영에는 Node 24 프로세스를 돌릴 수 있는 호스팅이 필요하다. 아래는 **후보 목록일 뿐이며 어떤 계정·DNS·배포도 만들거나 바꾸지 않았다.**

- Hostinger의 Node.js 앱 호스팅 또는 VPS (기존 계정 활용 가능 여부·요금제 지원은 원장님 확인 필요)
- 컨테이너형 Node 호스팅(예: Render, Fly.io, Railway) — `node dist/server/entry.mjs` 그대로 실행
- Cloudflare Workers/Pages (어댑터 교체 필요, 어휘 서비스와 같은 플랫폼)

어느 쪽이든 `learn.haeonkorean.com`은 **제안 주소**다. 앱은 `LEARN_APP_ORIGIN`으로 origin을 주입받으며 기본값은 `http://localhost:4400`이다. 운영 도메인·DNS·배포 대상은 개발 6단계 뒤 운영 적용안에서 사용자 확인을 받아 정한다.

## 실행 명령 (apps/learn 에서)

```sh
npm ci                     # 학습 앱 의존성만 설치 (루트와 별개)
npm run dev                # astro dev, 0.0.0.0:4400, 검토용 미리보기 자동 켜짐
npm run check              # astro check (타입·.astro 검사)
npm test                   # vitest 단위 시험 (키·DB·네트워크 불필요)
npm run build              # astro check && astro build → dist/server/entry.mjs
npm run test:smoke         # 빌드된 서버를 실제로 띄워 경로·헤더·Origin 검사 확인
npm run verify:clean       # 루트 node_modules 없는 임시 복사본에서 ci·build·test·smoke
npm start                  # 운영형 실행: HOST/PORT/LEARN_APP_ORIGIN 환경 변수 사용
LEARN_PREVIEW=1 npm start  # 빌드 서버에서 검토용 미리보기 켜기 (운영에서는 쓰지 않음)
```

## 결과와 남은 질문

- 좋아지는 점: 한 프로세스·한 origin, 본사이트와 같은 디자인·문법, 루트 빌드·배포 무변경.
- 비용: 운영에는 별도 Node 호스팅이 필요하다. 학습 앱 빌드에는 저장소의 `src/design-system/`이 함께 있어야 한다.
- 개발 4단계에서 정할 것: claim 멱등 키·재시도 창, 쿠키 이름(`__Host-` 사용 여부), 로컬 Supabase(CLI·Docker) 실행 방식.
- 개발 5단계에서 정할 것: island 프레임워크(React 기본 후보) 확정.
