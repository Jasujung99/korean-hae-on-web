# 해온 HAEON 웹사이트

해온의 한국어 발음 체크, 수업, 학습 키트를 소개하는 Astro 기반 정적 웹사이트입니다.

## 실행

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

- 개발 서버: `http://localhost:4321`
- 정적 빌드 및 검증: `npm run build`
- 빌드 결과: `dist/`

## 배포

이 프로젝트의 실제 배포 산출물은 저장소 루트가 아니라 `dist/`입니다.

Hostinger에서 Git 배포를 사용할 때는 다음 중 하나로 설정해야 합니다.

1. Hostinger가 Node 빌드를 지원하는 경우
   - Install command: `npm install`
   - Build command: `npm run build`
   - Publish directory: `dist`
2. Hostinger가 정적 파일 업로드만 지원하는 경우
   - 로컬에서 `npm run build` 실행
   - `dist/` 폴더 안의 파일 전체를 Hostinger의 `public_html`에 업로드

주의: 루트의 `index.html`은 오래된 정적 미리보기 파일입니다. `haeonkorean.com` 배포 확인용 파일이 아니며, Hostinger 문서 루트가 저장소 루트로 잡혀 있으면 최신 Astro 수정사항이 보이지 않습니다.

배포 후 확인:

- `https://haeonkorean.com/`에서 푸터 로고가 가로형으로 정상 표시되는지 확인합니다.
- 페이지 소스에 `/_astro/` CSS와 이미지 경로가 포함되어 있는지 확인합니다.
- `https://haeonkorean.com/sitemap-index.xml`이 열리는지 확인합니다.
- 브라우저 캐시 또는 Hostinger 캐시가 남아 있으면 캐시를 비우고 다시 확인합니다.

자세한 절차는 [docs/deployment-hostinger.md](docs/deployment-hostinger.md)를 참고하세요.

## MVP 라우트

| 경로 | 역할 | 검색 노출 |
| --- | --- | --- |
| `/` | 브랜드 홈과 핵심 CTA | 허용 |
| `/start/` | 방문 목적에 따른 시작점 선택 | 제외 |
| `/events/free-pronunciation-coaching/` | 무료 발음 체크 안내 및 신청 | 허용 |
| `/classes/` | 온라인 수업 및 KIIP 보조 학습 안내 | 허용 |
| `/study-kits/` | 학습 키트 미리보기 | 허용 |
| `/contact/` | 수업, 자료, 협업 문의 | 허용 |
| `/thanks/coaching/` | 발음 체크 신청 결과 | 제외 |
| `/thanks/inquiry/` | 문의 결과 | 제외 |
| `/privacy/`, `/terms/`, `/refund/` | 운영 정책 | 제외 |

## 운영 설정

`.env.example`을 `.env`로 복사한 뒤 실제 값만 입력합니다.

```dotenv
SITE_URL=https://haeonkorean.com
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

- `SITE_URL`을 실제 도메인으로 설정해야 canonical URL과 sitemap이 올바르게 생성됩니다.
- 폼 엔드포인트가 비어 있으면 입력 내용은 외부로 전송되지 않는 데모 모드로 동작합니다.
- 결제 URL이 비어 있으면 학습 키트는 미리보기만 노출되고 구매 버튼은 비활성화됩니다.
- 법률 페이지는 운영 준비를 돕는 초안이며, 실제 사업 정보와 환불 정책이 확정된 뒤 검토가 필요합니다.

## 출시 전 확인

1. 실제 도메인과 공개 이메일을 확정합니다.
2. 무료 발음 체크 및 일반 문의를 받을 폼 서비스의 엔드포인트를 준비합니다.
3. 사업자명, 사업자 번호, 주소, 통신판매 정보가 확정되면 정책 페이지에 반영합니다.
4. 학습 키트 판매 방식과 결제 URL을 확정합니다.
5. GA4 측정 ID를 입력하고 실제 배포 환경에서 CTA 이벤트를 확인합니다.
6. `npm run build`를 실행해 필수 라우트, 메타데이터, 이미지 링크, robots, sitemap 검증을 통과시킵니다.
