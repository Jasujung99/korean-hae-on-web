# 해온 성인 소리 학습 앱 (`apps/learn`)

성인 학습자가 개인 초대로 처음 연결한 뒤 같은 주소에서 ㅈ·ㅊ·ㅉ 듣기 연습을 이어가고, 교사가 담당 학습자의 기록을 관찰하는 앱이다. 설계 기준은 [`docs/adult-phoneme-app/`](../../docs/adult-phoneme-app/README.md)이다.

> 개발 1~6단계(구현 순서)와 학습 Stage 0~5(콘텐츠 분류)는 다른 개념이다.

## 현재 상태: 개발 1단계 (앱 경계와 해온 디자인)

- 화면 껍데기만 있다. 초대·기기 세션·DB·음원·교사 인증은 **연결되지 않았다**.
- 점수·예시 기록·가짜 학습자를 만들지 않는다. 모든 재생·선택 버튼은 '아직 준비 중'으로 비활성이다.
- 키나 DB 없이 실행된다. Supabase·Gemini 호출이 없고 비밀값을 읽지 않는다.

프레임워크·런타임·패키지 경계의 근거는 [ADR 0001](docs/adr/0001-app-framework-and-runtime.md)에 있다.

## 실행

Node 24, npm 11 기준. 모든 명령은 `apps/learn/`에서 실행한다. 루트 본사이트의 `npm ci`·`npm run build`·배포와 섞이지 않는다.

```sh
npm ci
npm run dev          # http://localhost:4400 (0.0.0.0 바인딩), 검토용 미리보기 켜짐
npm run check
npm test             # 단위 시험
npm run build        # dist/server/entry.mjs
npm run test:smoke   # 빌드 서버를 띄워 경로·헤더·Origin 검사
npm start            # HOST, PORT, LEARN_APP_ORIGIN 사용
```

화면 스크린샷과 320px 가로 넘침 검사(선택, Python playwright 필요):

```sh
python3 scripts/capture-screens.py --base http://localhost:4400 --out /tmp/learn-shots --chrome /usr/bin/google-chrome
```

## 설정

| 변수 | 설명 |
|---|---|
| `LEARN_APP_ORIGIN` | 브라우저가 보는 앱 origin. 기본 `http://localhost:4400`. `learn.haeonkorean.com`은 제안 주소일 뿐 활성 주소가 아니다. |
| `LEARN_PREVIEW` | `1`이면 빌드 서버에서도 검토용 미리보기 막대를 켠다. `astro dev`에서는 자동으로 켜진다. 운영에는 설정하지 않는다. |
| `HOST`, `PORT` | `npm start` 시 Node 어댑터가 읽는다. |

비밀값(`SUPABASE_*`, `GEMINI_API_KEY`)은 1단계에서 쓰지 않는다. 이후에도 서버 환경 변수로만 넣고 저장소·문서·로그·브라우저에 두지 않는다.

## 화면 (개발 1단계)

| 경로 | 화면 |
|---|---|
| `/` | 공통 학습 주소. 기기 연결 없음 안내(개인 링크로 시작) |
| `/join#token=…` | 개인 초대 첫 방문. GET으로 소비하지 않음, 주소 조각을 즉시 지움, 시작 버튼 비활성 |
| `/practice` | 듣기 퀴즈(듣고 자음 고르기) |
| `/practice/compare` | 비교 도움(ABX) — 자음 식별과 별도 과제 |
| `/practice/finish` | 연습 마무리 |
| `/words` | 사전·예문 확장(빈 상태) |
| `/teacher` | 교사 관찰 목록(+PC 상세 자리). 미리보기가 아니면 '교사 로그인이 필요해요' |
| `/teacher/learners/:id` | 학습자 상세(빈 상태). 미리보기가 아니면 인증 필요 |
| `/api/health` | 같은 origin API 구조 확인용 |

## 검토용 미리보기

화면 위 연보라 막대는 화면 사이를 오가는 **검토용 링크**다. 실제 교사 인증·권한이 아니며 상태를 브라우저 저장소나 쿠키에 남기지 않는다. 빌드 서버에서는 `LEARN_PREVIEW=1`일 때만 나타난다.

## 디자인

루트 `src/design-system/tokens.css`·`base.css`를 직접 불러오고(복사하지 않음), 학습 앱 의미 이름은 `src/styles/haeon-adapter.css`에서 원본 변수에 연결한다. 로고는 `src/design-system/logos/logo-olive.svg`의 실제 경로를 쓴다. 종이색 바탕, 올리브 강조, 명조(Noto Serif KR), 세이지·라벤더 면, 넉넉한 여백. `old-site/`, `old-design-system/`, 루트 `index.html`은 쓰지 않는다.
