# 해온 소리 연습 (`apps/learn`)

성인 학습 앱의 개발 1단계입니다. 공통 주소, 개인 초대 자리, 듣기 퀴즈, 비교 도움, 마무리, 사전·예문, 교사 목록/상세의 **화면 껍데기**만 있습니다. 초대 소비, 기기 세션, 음원, 점수, 데이터베이스는 없습니다.

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
- `GET /practice`: 개발 미리보기에서는 첫 12개 초안 단어를 보여 줍니다. 표기는 초안·미검수이고, 음원과 점수 저장은 없습니다. 미리보기가 아니면 빈 퀴즈 껍데기만 있습니다. 개발 서버(`npm run dev`)는 미리보기가 켜져 `http://127.0.0.1:4174/practice`에서 단어를 봅니다.
- `GET /compare`, `/finish`, `/dictionary`: 비교·마무리·사전 껍데기. 뜻과 예문은 검수 전이라 비어 있습니다.
- `GET /api/health`: 저장소와 세션이 없다는 상태.
- `GET /api/config`: 주입된 origin과 미리보기 여부. 쿠키를 발급하지 않습니다.
- `GET /robots.txt`: `Disallow: /`.
- `GET`, `HEAD`, `OPTIONS`가 아닌 `/api/*`는 `Origin`이 설정된 앱 주소와 같아야 하고, `Content-Type`은 `application/json`이어야 합니다.
- 교사 경로 `/teach`, `/teach/detail`: 미리보기가 아니면 인증 전 안내만 보여 줍니다. 미리보기에서는 빈 목록, 모음 맥락 필터, 빈 3×3 혼동표, 시간 정의만 보여 줍니다.

음원 버튼은 비활성입니다. HTML과 API 응답에는 `noindex`, 프레임 거부, `nosniff`를 붙이고 CORS 헤더는 보내지 않습니다.
