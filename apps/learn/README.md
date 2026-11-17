# 해온 소리 연습 (`apps/learn`)

성인 학습 앱입니다. 운영형 서버(`npm start`)에는 개발 1단계의 **화면 껍데기**만 열립니다. 초대 소비, 기기 세션, 교사 인증, 데이터베이스는 아직 없습니다.

개발 서버(`npm run dev`)에서는 **개발 미리보기**가 켜져, 듣기 퀴즈부터 교사 관찰까지 실제로 눌러 볼 수 있습니다. 자세한 범위는 아래 [개발 미리보기](#개발-미리보기)에 있습니다.

## 개발 미리보기

로컬 검토용입니다. 운영 기능이 아닙니다.

```sh
cd apps/learn
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:4174/`을 엽니다(`localhost`도 됩니다).

### 실제로 동작하는 것

| 화면 | 동작 |
| --- | --- |
| 듣기 퀴즈 `/practice` | ㅈ·ㅊ·ㅉ Stage 1(모음 사이) 의사단어 9문항. 자음마다 3문항씩 고르게 뽑고(`balanced-v1`) 순서를 섞습니다. 소리를 끝까지 들어야 답을 보낼 수 있고, 정오답은 서버가 판단합니다. 첫 응답만 성적에 넣고, 재생 실패·재생 중 응답·재시도는 따로 표시합니다. |
| 비교 도움 `/compare` | 풀던 문항의 소리와, 고른 소리(틀렸을 때) 또는 헷갈리기 쉬운 소리로 A·B·X를 만듭니다. 듣고 고르기와 따로 기록하고, 다녀와도 풀던 문항이 그대로 남습니다. |
| 마무리 `/finish` | 이번 회기의 첫 응답 결과, 소리별 결과, 가장 많이 헷갈린 짝, 비교 횟수. |
| 사전·예문 `/dictionary` | Stage 1 생활 어휘 22개(Core 60 배치표의 1-A 11개, 1-B 11개)의 학습용 뜻·예문(PR #5 초안, 검수 전)과 단어·예문 음원. 예문은 주어진 것만 씁니다. 시장·부치다·저쪽·어쩌다는 예문이 없어 비워 둡니다. 사전은 넣지 않았고, 넣을 수 있는 자리와 방식(A–D)을 점선 상자로 표시합니다. |
| 학습 순서 `/course` | ㅈ·ㅊ·ㅉ → ㅅ·ㅆ → ㄱ·ㅋ·ㄲ → ㅂ·ㅍ·ㅃ → ㄷ·ㅌ·ㄸ (2026-11-17 결정). 묶음끼리는 섞지 않습니다: 한 문항의 보기는 한 묶음 안에서만 나오고, PR #5의 치찰음 5지선다(ㅅ·ㅆ·ㅈ·ㅊ·ㅉ)는 쓰지 않습니다. ㅈ·ㅊ·ㅉ의 단계별 낱말은 PR #5 `08` 문서 3.1.2의 Core 60 배치표(후보 95개, Stage 1-A/1-B)를 따릅니다(`content/reference/jcj-core-table.json`). 다른 묶음은 PR #5 로드맵 초안입니다. 지금은 첫 묶음만 연습할 수 있습니다. |
| 목소리 고르기 `/voices` | 같은 문장을 `gemini-3.8-flash-tts` 기본 목소리 30개로 만든 표본. 목소리마다 **평평 낭독**(톤 지시 있음)과 **지시 없음**을 나란히 듣습니다. 낭독 후보 13개를 먼저 보여 주고 전체 30개로 펼칠 수 있습니다. 고른 결과는 미리보기 기록일 뿐 목소리를 확정하지 않습니다. |
| 교사 관찰 `/teach` | 위 화면에서 남긴 기록을 묶어 보여 줍니다(활동 시간, 첫 응답 혼동표, 다시 듣기, 가장 오래 머문 문항, 중단·재개, ABX). '예시 학습자 B'는 시안 수치이며 실제 기록이 아닙니다. |

### 화면 스타일과 소리 방식 비교

미리보기 맨 위 줄에서 두 가지를 바꿔 가며 같은 연습을 비교할 수 있습니다. 설정은 미리보기 저장소에 남고, 응답 기록에도 함께 적힙니다(`style`, `audioSource`).

| 전환 | 값 | 내용 |
| --- | --- | --- |
| 화면 스타일 | 시안 스타일 | 저장소 화면 시안 그대로(위 표). |
| 화면 스타일 | 캔버스 스타일 | 종이 조각·딱지·색인표 디자인. 흐름은 오늘의 연습 `/` → 01 듣고 고르기 `/practice` → 02 소리 익히기 `/listen` → 03 새 단어 `/dictionary` → 04 학습 리포트 `/finish`. 자모 조각은 벡터가 아니라 서체로 그립니다. 조각을 누르면 빈칸에 놓이면서 바로 첫 응답으로 제출됩니다(확인 버튼 없음). 소리 익히기는 점수를 매기지 않습니다. |
| 의사단어 소리 방식 | 고정 음원 | `audio/raw/`의 TTS 초안 파일. |
| 의사단어 소리 방식 | 브라우저 음성 | Web Speech API(`speechSynthesis`, ko-KR)로 읽습니다. 서버 키와 파일이 필요 없습니다. |

브라우저 음성의 한계: 목소리가 기기·브라우저마다 달라 '무엇을 들려주었는지'를 고정할 수 없고, 읽을 글자를 브라우저에 보내야 하므로 페이지 코드에서 정답을 볼 수 있습니다. 비교용 미리보기에서만 쓰며, 성적 기준 음원으로 삼지 않습니다. 한국어 음성이 없는 기기에서는 재생 실패로 처리되어 그 문항이 성적에서 빠집니다.

### 연습 목소리 3가지

학습자는 `/voices`에서 연습 목소리를 고릅니다: 남성 Charon, 여성 Erinome·Sulafat(2026-11-17 결정). 음원은 목소리마다 `<기본 id>--<charon|erinome|sulafat>.wav`로 따로 둡니다. 고른 목소리 파일이 없으면 예전 초안(Iapetus) 파일로 들려주며, 응답 기록에는 실제로 들려준 파일 id와 목소리가 남습니다.

```sh
npm run tts:practice -- --stages 0,1 --dry-run   # 만들 개수만 보기
npm run tts:practice -- --stages 0,1 --delay 8000
```

단계별로 나눠 교체합니다. 지금은 Stage 0·1만 만듭니다(의사단어·첫 듣기 음절 15, 단어 28, 주어진 예문 18 × 3목소리 = 183). 할당량에 걸리면 멈추고, 다시 실행하면 이미 만든 파일은 건너뜁니다.

### 평평한 낭독 톤 지시

짧은 의사단어를 글자만 보내면 모델이 감탄사처럼 억양을 붙이는 일이 있습니다. 그래서 표본에 톤 지시 `neutral, monotone and flat, read aloud slowly and clearly`를 붙여 비교합니다. 지시는 문서 권고대로 읽을 글자와 따로(`speech_metadata.style`) 보내야 소리로 읽히지 않으므로, 지시가 있는 요청만 Interactions 엔드포인트(`/v1beta/interactions`)를 씁니다. 지시가 없는 요청은 기존 `generateContent`를 그대로 씁니다. 연습 음원(`tts:generate`, `tts:batch`)은 종류별로 나눕니다. 의사단어·단어는 평평한 낭독 지시를 붙이고, 예문은 지시 없이 문장에 어울리게 읽힙니다(`--no-style`이면 모두 지시 없이). 메타 파일(`*.meta.json`)의 `settings.stylePrompt`에 어떤 지시로 만들었는지 남습니다.

### 실제가 아닌 것

- 학습자는 고정된 '미리보기 학습자' 하나입니다. 개인 초대·기기 세션·교사 인증을 대신하지 않습니다. 역할 전환 버튼은 권한이 아닙니다.
- 기록은 `apps/learn/.preview-data/`의 JSON Lines 파일에만 남습니다(커밋하지 않음). 운영 DB가 아닙니다. 교사 화면의 '미리보기 기록 지우기'로 비울 수 있습니다.
- 음원은 `audio/raw/`의 **검수 전 초안**입니다(커밋하지 않음). 청취 검수·Core 60 승인·다화자 전이와 무관합니다. 다른 컴퓨터에서는 아래 명령으로 다시 만들어야 하며, 없으면 화면이 '음원 준비 중'으로 표시합니다.
- 운영형 서버(`npm start`, `LEARN_SCREEN_PREVIEW` 꺼짐)에서는 `/api/preview/*`가 열리지 않습니다(`npm run test:smoke`가 확인).

### 미리보기 음원 만들기

키는 `GEMINI_API_KEY` 환경 변수로만 넣습니다. 시험·빌드는 생성 호출을 하지 않습니다. 이미 만든 파일은 건너뜁니다(`--force`로 다시 만듦).

```sh
npm run tts:auditions            # 30개 목소리, 톤 지시 없음(audition-<voice>.wav)
npm run tts:auditions -- --flat  # 30개 목소리, 평평한 낭독 지시(audition-<voice>-flat.wav)
npm run tts:auditions -- --flat --voices "Charon,Kore"  # 일부만
npm run tts:batch -- --voice Iapetus --ids "pw-아자,pw-아차,pw-아짜,pw-이자,pw-이차,pw-이짜,pw-오자,pw-오차,pw-오짜"
npm run tts:batch -- --voice Iapetus --ids "word-Stage1-1871-모자,sentence-Stage1-1871-모자"
```

응답이 WAV이면 그대로, MIME이 PCM이라고 밝힐 때만 WAV 머리말을 붙입니다. 형식을 알 수 없으면 저장하지 않습니다.

### 미리보기 API

모두 같은 origin이며, 상태 변경 요청은 Origin·JSON 검사를 거칩니다. 개발 서버는 주소가 비어 있으면 자기 주소(`127.0.0.1`, `localhost`)만 받습니다.

| 경로 | 하는 일 |
| --- | --- |
| `GET /api/preview/course` | 학습 순서와 묶음별 단계 요약 |
| `POST /api/preview/sessions`, `GET …/sessions/current` | 회기 출제와 이어하기 |
| `POST /api/preview/answers` | 첫 응답 판정. 같은 이벤트 id는 한 번만 셉니다 |
| `POST /api/preview/abx/trials`, `…/abx/answers` | 두 소리 비교 |
| `POST /api/preview/events` | 재생·화면 숨김·건너뛰기 같은 이벤트 묶음 |
| `GET /api/preview/words`, `/voices`, `/audio/:ref` | 단어 카드, 목소리 표본, 음원(정답이 드러나지 않는 ref) |
| `GET /api/preview/teacher/learners[/:id]` | 교사 관찰 집계 |
| `POST /api/preview/reset` | 미리보기 기록 지우기 |

본사이트와 배포는 이 패키지를 설치하지 않습니다. 루트에서 `npm ci` 또는 `npm run build`를 실행해도 여기 의존성과 `apps/learn/dist`는 루트 `dist/`에 들어가지 않습니다. 이유는 [ADR 0001](docs/adr/0001-node-hono-vite.md)에 있습니다.

## 실행

Node.js 22 이상. 루트 GitHub Actions는 Node 24를 씁니다. 저장소 루트가 아니라 이 디렉터리에서 실행합니다. Windows에서는 PowerShell이나 cmd에서 같은 `npm` 명령을 쓰면 됩니다. 스크립트는 `sh`를 호출하지 않습니다.

```sh
cd apps/learn
npm ci
npm test
npm run typecheck
npm run dev
```

개발 화면: `http://127.0.0.1:4174/`

개발 서버는 화면과 `/api/*`, `/robots.txt`를 같은 origin에서 제공합니다. API 전달은 프로덕션과 같은 Node 요청 리스너를 써서 본문과 `Set-Cookie`를 빠뜨리지 않습니다. 키와 DB 없이 열립니다. 역할 전환은 이 개발 서버에서만 기본으로 보이며, 교사 로그인이 아닙니다.

프로덕션 서버와 검사:

```sh
npm run build
npm start
npm run validate:content
npm run test:smoke
npm run verify:clean
```

`npm start`는 `HOST`(기본 `127.0.0.1`)와 `PORT`(기본 `4174`)에 빌드된 화면과 API를 함께 제공합니다. `npm run validate:content`는 콘텐츠 참조, 출현이 여러 개인 문항의 목표 위치, 미승인 자료의 공개 릴리스 편입을 검사합니다. `npm run test:smoke`는 프로덕션 서버를 실제로 띄워 경로, `noindex`, `robots.txt`, Origin 403, JSON이 아닌 본문 415, 쿠키 없음을 확인합니다. `npm run verify:clean`은 루트 `node_modules` 없이 임시 복사본에서 `npm ci`, `build`, `test`, `validate:content`, `test:smoke`를 실행합니다.

`npm run preview`는 빌드 결과만 Vite로 보여 줍니다. `npm start`와 `npm run preview`에서는 역할 전환이 꺼져 있습니다. 레이아웃만 다시 보려면 `LEARN_SCREEN_PREVIEW=1`을 붙입니다. 그래도 교사 권한은 생기지 않습니다.

## 설정

`.env.example`을 참고합니다. 앱이 읽을 값은 다음뿐입니다.

| 변수 | 의미 |
| --- | --- |
| `LEARN_APP_ORIGIN` | 화면에 보여줄 절대 주소. 상태 변경 API의 `Origin`도 이 값과 같아야 합니다. 비우면 그 요청은 거절합니다. DNS와 배포는 바뀌지 않습니다. |
| `LEARN_SCREEN_PREVIEW` | `1`이면 역할 전환 껍데기, `0`이면 숨김. |
| `HOST` | `npm start`가 묶는 주소. 기본 `127.0.0.1`. |
| `PORT` | `npm start` 포트. 기본 `4174`. |

제안 호스트 이름은 기본값으로 넣지 않습니다. 환경 변수에 적더라도 화면은 그 주소를 운영 중인 도메인으로 표시하지 않습니다.

## 이 단계에 있는 것

- `GET /`: 기기가 연결되기 전 공통 주소. 개인 링크로 시작하라는 안내만 있습니다.
- `GET /join`: 주소 조각의 초대 토큰을 읽고 주소창에서 바로 지웁니다. 토큰은 메모리에만 두고, ‘이 기기에서 시작하기’는 서버를 호출하지 않는 비활성 버튼입니다.
- `GET /practice`: 개발 미리보기에서는 첫 12개 초안 단어를 보여 줍니다. 표기는 초안·미검수이고, 음원과 점수 저장은 없습니다. 미리보기가 아니면 빈 퀴즈 껍데기만 있습니다. 개발 서버(`npm run dev`)의 `http://127.0.0.1:4174/practice`에서 첫 12개 초안 단어를 봅니다. 음원 버튼은 `아직 준비 중`입니다.

청취 표본은 키가 있을 때만, 이 디렉터리에서 명시적으로 실행합니다. 키는 환경 변수로만 읽고 로그나 파일에 적지 않습니다. 목소리가 고정된 것은 아닙니다. 초기 후보는 Iapetus입니다.

```sh
npm run tts:audition
```

Windows PowerShell:

```powershell
$env:GEMINI_API_KEY = "발급받은 키"
npm run tts:audition
```

키가 없으면 `GEMINI_API_KEY is not configured. Live TTS generation is incomplete.`만 출력하고 끝납니다. 특정 초안 한 건만 만들 때는 `npm run tts:generate -- --id pw-아자`입니다. 원본 WAV는 `audio/raw/`에만 쓰고, 배포본과 승인 상태는 바꾸지 않습니다.
- `GET /compare`, `/finish`, `/dictionary`: 비교·마무리·사전 껍데기. 뜻과 예문은 검수 전이라 비어 있습니다.
- `GET /api/health`: 저장소와 세션이 없다는 상태.
- `GET /api/config`: 주입된 origin과 미리보기 여부. 쿠키를 발급하지 않습니다.
- `GET /robots.txt`: `Disallow: /`.
- `GET`, `HEAD`, `OPTIONS`가 아닌 `/api/*`는 `Origin`이 설정된 앱 주소와 같아야 하고, `Content-Type`은 `application/json`이어야 합니다.
- 교사 경로 `/teach`, `/teach/detail`: 미리보기가 아니면 인증 전 안내만 보여 줍니다. 미리보기에서는 빈 목록, 모음 맥락 필터, 빈 3×3 혼동표, 시간 정의만 보여 줍니다.

음원 버튼은 비활성입니다. HTML과 API 응답에는 `noindex`, 프레임 거부, `nosniff`를 붙이고 CORS 헤더는 보내지 않습니다.
