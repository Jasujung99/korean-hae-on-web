# HAEON SEO Website Plan

해온 웹사이트를 정적 SEO 사이트로 전환하기 위한 논의용 페이지 구성안입니다. 이 문서는 구현 전에 정보 구조, 첫 화면 방향, 전환 동선, SEO 페이지를 먼저 합의하기 위한 기준 문서입니다.

## Design Read

Reading this as: premium Korean-learning landing site for foreign learners and local Korean-class seekers, with a calm water-led brand language, leaning toward a light editorial consumer site with restrained motion.

Recommended dials:

- `DESIGN_VARIANCE: 7`
- `MOTION_INTENSITY: 5`
- `VISUAL_DENSITY: 3`

이 방향은 참고 히어로 이미지처럼 물결, 빛, 여백, 얇은 라인, 선명한 남색 CTA를 중심으로 잡습니다. 교육 사이트처럼 보이되 학원 전단지처럼 보이지 않게, 브랜드 신뢰와 학습 경험을 먼저 전달합니다.

## Core Positioning

해온은 단순히 한국어 자료를 파는 사이트가 아니라, 이해 중심의 한국어 학습 경험을 제공하는 브랜드로 잡는 것이 좋습니다.

핵심 문장 후보:

- 한국어가 이해되는 순간, 세계가 조금 더 가까워집니다
- 듣고, 연결하고, 내 말로 이어가는 한국어
- 발음, 문장, 문화까지 자연스럽게 이어지는 한국어

홈의 1순위 전환은 초기에는 `무료 발음 코칭 신청`으로 두는 것을 권장합니다. 무료 화상 이벤트는 진입 장벽이 낮고, 이후 PDF 묶음 구매나 정규 수업 상담으로 이어지기 좋습니다.

보조 전환:

- PDF/영상 자료 보기
- 화상 수업 살펴보기
- 학습 웹앱 사용하기

## Recommended Navigation

Desktop nav:

```text
해온 HAEON | 해온의 방식 | 수업 | 자료실 | 무료 코칭 | 웹앱 | 이야기 | 학습 시작하기
```

Mobile nav:

```text
해온 HAEON | 학습 시작하기 | menu
```

`학습 시작하기` 버튼은 사용자를 바로 결제 페이지로 보내기보다, 선택 화면으로 보내는 것이 안전합니다. 예를 들어 `/start`에서 다음 선택지를 보여줍니다.

- 무료 발음 코칭 신청
- PDF/영상 묶음 구매
- 화상 수업 상담
- 학습 웹앱 바로가기

## Home Page Structure

### 1. Hero

Goal: 브랜드 인상과 핵심 약속을 5초 안에 전달합니다.

Visual direction:

- 전체 화면 가까운 밝은 물결 이미지
- 좌측에 큰 한글 헤드라인
- 우측 또는 물결 위에 `듣기`, `연결`, `말하기` 같은 원형 인터랙션 포인트
- 상단 내비게이션은 얇고 조용하게
- CTA는 남색 단색 버튼 1개, 보조 CTA는 얇은 테두리 버튼 1개

Hero copy draft:

```text
UNDERSTANDING, ON.

한국어가 이해되는 순간,
세계가 조금 더 가까워집니다

듣고, 연결하고, 내 말로 이어가는 한국어

[무료 코칭 신청] [자료 둘러보기]
```

### 2. Start Options

Goal: 방문자가 자기 목적에 맞는 입구를 고릅니다.

Layout: 같은 크기 카드 4개보다 비대칭 bento 형태가 좋습니다.

Content:

- 무료 발음 코칭: 가장 크게 배치
- PDF + YouTube 영상 묶음: 구매형 자료
- 1:1 또는 그룹 화상 수업: 상담형 전환
- 학습 웹앱: 즉시 사용 가능한 도구

### 3. Free Pronunciation Coaching Event

Goal: 초기 리드 확보와 신뢰 형성입니다.

Content:

- 무료 화상 발음 코칭
- 15분 또는 20분 체험
- 대상: 한국어 발음이 막히는 초급/중급 학습자
- 신청 버튼
- 예약 가능 시간 또는 신청 폼

SEO target:

- 한국어 발음 교정
- 온라인 한국어 발음 수업
- 외국인 한국어 발음 코칭

### 4. Study Kits

Goal: PDF와 영상 묶음 상품을 소개합니다.

Content:

- 한글 모음 기본 원리 PDF
- 발음 영상 또는 YouTube 강의 링크
- 학습 순서
- 미리보기 이미지
- 구매 버튼

Important note:

순수 정적 HTML만으로는 유료 파일 접근을 안전하게 제한하기 어렵습니다. 초기에는 Gumroad, Payhip, Lemon Squeezy, 크몽, PayPal 링크 같은 외부 결제/전달 플랫폼을 붙이는 방식이 가장 단순합니다.

더 강한 보호가 필요하면 결제 웹훅, 서버리스 API, 비공개 파일 저장소, 만료되는 다운로드 링크가 필요합니다.

### 5. Online Classes

Goal: 정규 수업 상담으로 연결합니다.

Content:

- 1:1 한국어 수업
- 소그룹 한국어 수업
- KIIP 또는 사회통합프로그램 보조 수업
- 충청권 오프라인 또는 하이브리드 가능 여부

SEO target:

- 온라인 한국어 수업
- 외국인 한국어 수업
- KIIP 한국어 수업
- 천안 한국어 수업
- 아산 한국어 수업
- 충청 한국어 수업

### 6. Learning Web Apps

Goal: 다른 학습 웹앱으로 연결합니다.

Possible apps:

- 한글 발음 연습
- 모음/자음 퀴즈
- 받아쓰기 연습
- KIIP 단어장
- 문장 만들기 연습

이 섹션은 단순 링크 목록보다 앱 런처처럼 보여주는 것이 좋습니다. 각 앱은 나중에 `/apps/{app-slug}`로 독립 SEO 페이지를 받을 수 있습니다.

### 7. Method

Goal: 해온만의 학습 철학을 설명합니다.

Content:

- 듣기
- 연결하기
- 말하기

참고 히어로 이미지의 세 개 원형 포인트와 이어지게 구성하면 브랜드 기억이 강해집니다.

### 8. Tutor / Story

Goal: 교육자의 얼굴과 신뢰를 제공합니다.

Content:

- 튜터 소개
- 수업 방식
- 학습자 후기
- 지역 기반 신뢰 요소

후기는 실제 후기가 생기기 전까지는 과장된 가짜 문장보다 짧은 수업 원칙과 실제 과정 사진/자료 이미지가 낫습니다.

### 9. SEO Articles

Goal: 검색 유입을 장기적으로 확보합니다.

Article categories:

- 한국어 발음
- 한글 읽기
- KIIP 준비
- 한국어 학습 자료
- 충청권 한국어 수업

홈에는 최신 글 3개만 노출하고, 전체 글은 `/learn` 또는 `/blog`에서 관리합니다.

### 10. Final CTA

Goal: 사용자가 마지막에 다시 선택할 수 있게 합니다.

CTA options:

- 무료 코칭 신청
- 자료실 보기
- 수업 문의하기

여기서도 1순위 CTA는 하나만 강조합니다.

## Proposed Page Tree

```text
/
/start
/method
/classes
/classes/online-korean
/classes/kiip
/classes/pronunciation
/study-kits
/study-kits/hangeul-vowels
/events/free-pronunciation-coaching
/apps
/apps/hangeul-pronunciation
/apps/kiip-vocabulary
/learn
/learn/korean-pronunciation
/learn/hangeul
/learn/kiip
/locations/cheonan
/locations/asan
/locations/chungcheong
/tutors
/stories
/contact
/privacy
/terms
/refund
```

초기 버전에서 전부 만들 필요는 없습니다. 먼저 아래만 만들어도 충분합니다.

```text
/
/start
/classes
/study-kits
/events/free-pronunciation-coaching
/apps
/learn
/contact
/privacy
/terms
```

## SEO Strategy

정적 사이트에서 SEO를 잡으려면 홈보다 상세 페이지가 중요합니다. 홈은 브랜드와 큰 전환을 담당하고, 검색 키워드는 상세 페이지가 받는 구조가 좋습니다.

Per-page basics:

- 고유한 `title`
- 고유한 `description`
- 하나의 명확한 `h1`
- canonical URL
- Open Graph 이미지
- JSON-LD 구조화 데이터
- 내부 링크
- 실제 텍스트 콘텐츠

Structured data candidates:

- `Organization`
- `LocalBusiness` 또는 `EducationalOrganization`
- `Course`
- `Product`
- `FAQPage`
- `Article`
- `BreadcrumbList`

## Payment and Download Flow

### MVP

Static website:

- 상품 소개 페이지
- 외부 결제 버튼
- 결제 플랫폼이 PDF 다운로드와 영상 링크 전달

Good for:

- 빠른 시작
- 유지보수 부담 낮음
- 워드프레스 없이 판매 가능

Risk:

- YouTube 미등록 링크는 공유될 수 있음
- PDF 파일이 직접 공개 URL에 있으면 유료 보호가 안 됨

### Stronger Version

Static frontend + serverless backend:

- 결제 플랫폼 웹훅 수신
- 구매자 이메일 확인
- 만료되는 다운로드 링크 발급
- 비공개 스토리지에 PDF 보관
- 영상은 접근 제한 가능한 플랫폼 사용

Good for:

- 유료 콘텐츠 보호
- 구매자 관리
- 재다운로드 링크 관리

Cost:

- 초기 구현 복잡도 증가

## Visual System Notes

Palette:

- Base: off-white, pale blue, soft cyan
- Text: deep navy
- Accent: clear water blue
- CTA: deep navy button with white text

Shape:

- Buttons: pill
- Floating icons: circle
- Content blocks: soft radius, but card 남발은 피함

Motion:

- 물결 배경은 아주 느린 parallax 또는 opacity shift
- CTA와 원형 포인트는 hover feedback
- 스크롤 섹션은 가벼운 reveal
- 과한 애니메이션보다 학습 흐름을 보여주는 모션을 우선

Image rules:

- 첫 화면은 실제 물결/물 이미지가 주인공
- PDF 상품은 실제 PDF 미리보기 이미지 사용
- 웹앱은 가짜 대시보드 이미지보다 실제 화면 캡처 사용
- 튜터/수업 섹션은 가능하면 실제 사진 또는 브랜드에 맞춘 생성 이미지 사용

## Open Decisions

1. 홈의 1순위 CTA를 무엇으로 둘지 결정해야 합니다.
   - 추천: 무료 발음 코칭 신청
   - 대안: PDF/영상 자료 구매
   - 대안: 수업 상담
2. 결제와 다운로드 전달을 외부 플랫폼으로 시작할지, 처음부터 자체 다운로드 보호를 만들지 결정해야 합니다.
3. 지역 SEO를 천안/아산/충청으로 가져갈지, 온라인 한국어 수업 중심으로 시작할지 결정해야 합니다.
4. YouTube 영상은 공개, 미등록, 멤버십, 외부 강의 플랫폼 중 어떤 방식으로 운영할지 정해야 합니다.
5. 학습 웹앱들은 해온 사이트 내부 route로 둘지, 별도 도메인/서브도메인으로 연결할지 정해야 합니다.
