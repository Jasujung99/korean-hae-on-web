# korean-hae-on-web

해온(HAEON) 한국어 교육 콘텐츠를 웹과 PDF로 확장하기 위한 작업 저장소입니다.

현재 저장소의 `index.html` 계열 파일은 실제 서비스용 홈페이지가 아니라, 한글 학습지 PDF 레이아웃을 확인하고 출력하기 위해 만든 임시 미리보기 문서입니다. 앞으로의 목표는 워드프레스에 맞춘 PHP 테마 구조가 아니라, 익숙한 IDE에서 개발할 수 있는 현대적인 정적 웹사이트로 전환하면서 검색 노출과 방문자 분석까지 함께 갖추는 것입니다.

## 목표

- 해온 브랜드에 맞는 빠르고 가벼운 정적 웹사이트 구축
- 구글과 네이버 검색 로봇이 바로 읽을 수 있는 HTML 구조 제공
- 한국어 수업, KIIP, 한글 학습지, PDF 자료 등 핵심 콘텐츠의 SEO 최적화
- 구글 서치 콘솔, 구글 애널리틱스, 네이버 서치어드바이저, 네이버 애널리틱스 연동
- PDF 자료 미리보기와 판매 또는 외부 결제 링크 연결
- 워드프레스 플러그인 의존 없이 배포 가능한 구조 유지

## 권장 방향

최종 웹사이트는 React 단독 CSR 앱이 아니라, 빌드 시점에 HTML을 미리 생성하는 정적 사이트 생성 방식으로 만드는 것을 권장합니다.

후보 프레임워크:

- `Next.js`: React 컴포넌트 재사용이 쉽고, 정적 생성과 SEO 메타데이터 관리가 안정적입니다.
- `Astro`: 정적 콘텐츠 중심 사이트에 가볍고 빠르며, 필요한 부분에만 React를 붙이기 좋습니다.

이 저장소에 이미 있는 디자인 자산, 로고, 물결 그래픽, PDF 레이아웃 아이디어는 이후 Next.js 또는 Astro 프로젝트의 컴포넌트와 에셋으로 옮겨 사용할 수 있습니다.

## 현재 구조

```text
.
├─ generate_pdf.py                 # ReportLab 기반 한글 학습지 PDF 생성 스크립트
├─ worksheet-preview/              # 브라우저에서 A4 학습지 레이아웃을 확인하는 임시 HTML 미리보기
│  ├─ index.html
│  ├─ styles.css
│  ├─ preview-server.js
│  └─ export-pdf.ps1
├─ resources/                      # 로고, 하단 물결 등 PDF/웹 공통 이미지 리소스
├─ assets/                         # 생성 이미지와 시각 자료
├─ fonts/                          # 폰트 압축 파일 및 폰트 관련 자료
├─ output/pdf/                     # 생성된 PDF 결과물
└─ tmp/                            # PDF 렌더링 확인용 임시 파일
```

## 현재 작업 실행

PDF를 직접 생성하려면:

```powershell
python .\generate_pdf.py
```

브라우저에서 학습지 미리보기를 확인하려면:

```powershell
node .\worksheet-preview\preview-server.js
```

접속 주소:

```text
http://localhost:5173/
```

미리보기 화면에서 인쇄 기능을 사용하거나 다음 스크립트로 PDF를 내보낼 수 있습니다.

```powershell
.\worksheet-preview\export-pdf.ps1
```

## SEO 사이트 전환 계획

1. Next.js 또는 Astro 프로젝트를 새로 구성합니다.
2. 현재 `worksheet-preview`에 있는 임시 HTML은 서비스 첫 화면으로 쓰지 않고, 필요한 디자인 요소만 컴포넌트로 재구성합니다.
3. 주요 페이지를 정적 HTML로 생성합니다.
   - 홈
   - 한국어 수업 안내
   - KIIP 또는 사회통합프로그램 안내
   - 한글 학습지/PDF 자료 소개
   - 결제 또는 외부 구매 링크 페이지
   - 문의/위치/지역 수업 안내
4. 각 페이지에 고유한 SEO 메타데이터를 넣습니다.
   - `title`
   - `description`
   - canonical URL
   - Open Graph 이미지
   - 구조화 데이터(JSON-LD)
5. 검색 엔진 등록을 위한 파일과 설정을 추가합니다.
   - `sitemap.xml`
   - `robots.txt`
   - Google Search Console 인증 태그 또는 DNS 인증
   - Naver Search Advisor 인증 태그
6. 방문자 분석 코드를 공통 레이아웃에 추가합니다.
   - Google Analytics 4
   - Naver Analytics
7. 정적 빌드 결과물을 호스팅어의 빈 HTML 웹사이트 또는 정적 호스팅 환경에 배포합니다.

## 검색/분석 연동 메모

정적 웹사이트에서도 워드프레스 플러그인 없이 다음 도구를 사용할 수 있습니다.

- Google Search Console: 구글 검색 노출, 검색어, 색인 상태 확인
- Google Analytics 4: 방문자 수, 유입 경로, 페이지 행동 분석
- Naver Search Advisor: 네이버 검색 수집과 노출 상태 확인
- Naver Analytics: 네이버 중심 방문자 행동 분석
- Naver Place: 충청권 로컬 검색 유입을 위한 기관/장소 등록

인증 태그와 분석 스크립트는 최종 프레임워크의 공통 레이아웃 파일에 한 번만 넣는 방식으로 관리합니다.

## 결제와 PDF 판매 방향

정적 사이트는 우커머스 같은 서버형 쇼핑몰 기능을 직접 포함하지 않습니다. 대신 다음 방식 중 하나를 연결합니다.

- PayPal Smart Payment Buttons
- Gumroad 같은 디지털 상품 판매 플랫폼
- 크몽, 탈잉, 클래스 플랫폼, 별도 결제 페이지 링크
- 수동 입금 안내와 문의 폼 조합

초기에는 외부 결제 링크를 버튼으로 연결하는 방식이 가장 단순하고 유지보수 부담이 적습니다.

## 주의할 점

- 현재 `worksheet-preview/index.html`은 PDF 미리보기용 임시 문서이므로 SEO용 메인 페이지로 사용하지 않습니다.
- React만으로 만든 CSR 사이트는 검색 노출에 불리할 수 있으므로, 최종 사이트는 SSG 또는 SSR 기반으로 구성합니다.
- 이미지 파일명에 공백과 한글이 섞여 있으므로, 배포용 에셋은 나중에 영문 kebab-case 이름으로 정리하는 것이 좋습니다.
- PDF 생성물과 임시 렌더링 파일은 실제 웹 배포 대상과 분리해서 관리합니다.

## 다음 단계

이 저장소의 다음 큰 작업은 Next.js 또는 Astro 기반의 실제 정적 사이트 뼈대를 만드는 것입니다. 그 후 현재 PDF/브랜드 자산을 옮기고, 검색 엔진이 읽기 좋은 페이지 구조와 메타데이터를 먼저 완성합니다.
