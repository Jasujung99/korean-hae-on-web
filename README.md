# 해온 HAEON 웹사이트

해온의 한국어 발음 체크, 수업, 학습 키트를 소개하는 Astro 기반 정적 웹사이트입니다. 메인 디자인을 유지하면서 MVP 전환 흐름과 운영 준비 상태를 구현했습니다.

## 실행

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

- 개발 서버: `http://localhost:4321`
- 정적 빌드 및 검증: `npm run build`
- 빌드 결과: `dist/`

## MVP 라우트

| 경로 | 역할 | 검색 노출 |
| --- | --- | --- |
| `/` | 브랜드 홈과 핵심 CTA | 허용 |
| `/start/` | 방문 목적에 따른 시작점 선택 | 제외 |
| `/events/free-pronunciation-coaching/` | 무료 발음 체크 안내·신청 | 허용 |
| `/classes/` | 온라인 수업·KIIP 보조 학습 안내 | 허용 |
| `/study-kits/` | 학습 키트 미리보기 | 허용 |
| `/contact/` | 수업·자료·협업 문의 | 허용 |
| `/thanks/coaching/` | 발음 체크 신청 결과 | 제외 |
| `/thanks/inquiry/` | 문의 결과 | 제외 |
| `/privacy/`, `/terms/`, `/refund/` | 운영 정책 | 제외 |

페이지 구조와 CTA 전략 프레젠테이션은 `output/presentations/haeon-mvp-page-plan.pptx`에 있습니다.

## 운영 설정

`.env.example`을 `.env`로 복사한 뒤 실제 값만 입력합니다.

```dotenv
SITE_URL=https://your-domain.example
PUBLIC_CONTACT_EMAIL=
PUBLIC_BUSINESS_NAME=해온 HAEON
PUBLIC_REPRESENTATIVE_NAME=
PUBLIC_BUSINESS_NUMBER=
PUBLIC_ECOMMERCE_NUMBER=
PUBLIC_BUSINESS_ADDRESS=
PUBLIC_COACHING_FORM_ENDPOINT=
PUBLIC_INQUIRY_FORM_ENDPOINT=
PUBLIC_STUDY_KIT_CHECKOUT_URL=
PUBLIC_STUDY_KIT_PRICE=19000
PUBLIC_GA_MEASUREMENT_ID=
```

- 폼 엔드포인트가 비어 있으면 입력 내용은 외부로 전송·저장되지 않는 데모 모드로 동작합니다.
- 결제 URL이 비어 있으면 학습 키트는 미리보기만 노출되고 구매 버튼은 비활성화됩니다.
- 실제 유료 상품 파일은 `public/`에 두지 않습니다. 현재 공개되는 것은 소개용 미리보기 이미지 2장뿐입니다.
- `SITE_URL`을 입력해야 canonical URL과 sitemap이 실제 도메인으로 생성됩니다.

## 출시 전 확인

1. 실제 도메인과 공개 이메일을 확정합니다.
2. 무료 발음 체크·일반 문의를 받을 폼 서비스의 엔드포인트를 준비합니다.
3. 대표자명, 사업자 정보, 주소를 입력하고 개인정보 처리방침·이용약관·환불 안내를 운영 방식에 맞게 검토합니다.
4. 학습 키트의 실제 페이지 수, 영상 수, 가격, 제공 방식과 환불 기준을 확정한 뒤에만 결제 URL을 설정합니다.
5. GA4 측정 ID를 입력하고 실제 배포 환경에서 CTA·폼 이벤트를 확인합니다.
6. `npm run build`를 실행한 뒤 `dist/`를 정적 호스팅에 배포합니다.

법률 페이지는 출시 준비를 돕는 초안이며 법률 자문을 대체하지 않습니다. 사업 정보와 실제 판매·환불 절차가 정해진 뒤 전문가 검토를 권장합니다.

## 구현 원칙

- 무료 발음 체크는 즉시 예약이 아니라 신청 후 이메일로 일정 조율하는 흐름입니다.
- 수업은 온라인을 우선하고 충청권 대면 가능성을 보조 정보로 안내합니다.
- KIIP 수업은 공식 운영 과정이 아닌 개인 보조 학습 서비스임을 명시합니다.
- 분석 이벤트에는 이름, 이메일, 문의 내용 같은 개인정보를 넣지 않습니다.
- `scripts/check-build.mjs`가 필수 라우트, 메타데이터, 내부 링크, robots, sitemap을 빌드마다 검사합니다.
