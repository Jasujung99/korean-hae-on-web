# 데이터와 API 계약

이 문서는 구현해야 할 논리 계약이다. 실제 마이그레이션과 API는 아직 없다. 세부 SQL·인덱스·프레임워크 타입은 개발 단계에서 작성하고, 아래 소유권·버전·동시성 조건을 유지한다.

## 데이터 묶음

성인 테이블은 `phoneme_` 접두사로 추가한다. 접두사는 보안 경계가 아니며 RLS·GRANT·서버 권한 검사를 함께 구현한다. 아래 이름은 제안 물리명이며 필요한 엔터티의 합치기·분리는 ADR에 남긴다.

| 엔터티 | 핵심 필드·규칙 |
|---|---|
| `phoneme_learners` | 고정 UUID, 별칭, 반/그룹 ID, 선택 모어·주사용 언어, 상태, 생성일. 초대 토큰과 분리 |
| `phoneme_teacher_assignments` | Supabase `auth.users.id`와 학습자/반 배정. 성인 역할·배정으로 조회 범위를 정함 |
| `phoneme_invitations` | learner ID, token hash, 발급 교사, 만료·소비·폐기 시각, claim 멱등 키 참조 |
| `phoneme_device_sessions` | learner ID, opaque token hash, 만료·폐기·마지막 사용. 원문 토큰은 저장하지 않음 |
| `phoneme_source_entries` | 원본 커밋·해시·inventory/entry/lexeme 키와 읽기 전용 원본 스냅샷 |
| `phoneme_lexeme_versions` | 의미 ID, 성인용 뜻·예문, 출처·이용 조건, 수정 사유, 검수 상태·이력 |
| `phoneme_occurrences` | 단어 판, 표기·실제 자음, 문자/음절 위치, 앞 소리, 후행 모음, 변동 규칙·근거 |
| `phoneme_audio_assets` | 모델·목소리·입력문·설정·생성일, 해시·MIME·길이·저장 경로, QA 상태 |
| `phoneme_item_versions` | 과제, 목표 출현, 자극/기준 음원, 보기·정답, 힌트, 평가/훈련 구분 |
| `phoneme_releases` | 승인된 문항·어휘·음원 판의 고정 묶음. 게시 후 원본 판을 덮어쓰지 않음 |
| `phoneme_sessions` | learner ID, 릴리스·선택 정책 판, 현재 위치·시작/종료·진행 상태 |
| `phoneme_attempt_events` | 서버가 확인한 learner/session/item 판, 이벤트 ID·순번·시각, 첫/재시도·재생·선택·시간·오류 |

콘텐츠 원본의 운영 `vocabulary.id`를 선택적으로 참조할 수 있으나 seed rank와 같다고 가정하지 않는다. 원본 FK 삭제가 응답·콘텐츠 이력의 연쇄 삭제를 일으키지 않게 한다. 신규 마이그레이션으로 기존 테이블·정책·함수 권한을 넓히지 않는다.

## 필수 유일성과 동시성

- 초대 token hash는 유일하다. 만료·폐기·미소비 조건을 확인한 상태 갱신과 기기 세션 생성은 한 트랜잭션이다.
- 성공 claim 응답을 잃고 같은 멱등 키로 재시도한 경우 기존 결과를 안전하게 복구한다. 이미 소비된 링크가 다른 기기를 새로 연결하게 해서는 안 된다. 짧은 claim 재시도 창과 기기 요청 비밀값 등 구체 방식은 구현 ADR에서 고정한다.
- 동일 학습자/클라이언트 이벤트 ID는 한 번만 저장한다. 같은 멱등 키로 다른 내용을 보내면 충돌 오류다.
- 첫 제출은 learner+학습 회기+문항 제시 ID 기준으로 하나다. 같은 문항 판이 복습에서 다시 나올 수 있으므로 `item_version_id`만으로 유일성을 정하지 않는다.
- 별칭은 로그인 키나 유일 식별자로 쓰지 않는다. 동일 별칭의 서로 다른 학습자를 허용하되 교사 목록에서 구별한다.
- 교사의 재발급은 이전 미사용 초대를 폐기하고 같은 learner ID에 새 초대를 만든다. 응답을 이동하거나 새 learner를 만들지 않는다.

## API 구분

모든 경로는 제안 계약이며 앱의 실제 라우터에 맞게 조정할 수 있다. 의미와 권한 경계는 유지한다. 응답에는 비밀값과 다른 학습자의 정보를 넣지 않는다.

### 교사 API

Supabase Auth 인증과 성인 교사 역할·배정을 서버에서 검사한다.

| 메서드·경로 | 역할 |
|---|---|
| `POST /api/teacher/learners` | 별칭·반으로 학습자 등록. 담당 교사 배정을 같은 작업에서 생성 |
| `GET /api/teacher/learners` | 담당 학습자 요약. 초대 상태·최근 학습·관찰 신호 |
| `POST /api/teacher/learners/:id/invitations` | 최초 발급/재발급. 토큰 원문은 이 응답에서만 반환 |
| `POST /api/teacher/invitations/:id/revoke` | 초대 폐기 |
| `GET /api/teacher/learners/:id/observation` | 허용 기간·과제·위치·모음 맥락의 관찰 기록 |
| `POST /api/teacher/device-sessions/:id/revoke` | 지정 기기 해제. 이력 유지 |

서버가 RLS를 우회하는 키를 쓰는 경우에도 요청별 권한 검사와 쿼리 범위 제한을 반드시 수행한다. 클라이언트가 보내는 teacher ID를 권한의 근거로 사용하지 않는다.

### 첫 연결 API

| 메서드·경로 | 역할 |
|---|---|
| `POST /api/invitations/inspect` | 토큰 유효성·최소 별칭 확인. 상태를 소비하지 않는 읽기 작업. 요청 본문 로그에서 토큰 제외 |
| `POST /api/invitations/claim` | 명시적 시작 버튼. token+멱등 키를 검증해 한 번 소비하고 HttpOnly 기기 쿠키 발급 |

브라우저 페이지 GET·헤더 미리보기·inspect는 소비 조건이 아니다. inspect/claim은 속도 제한과 크기 제한을 두고, 무효/만료/소비/폐기는 학습자에게 불필요한 개인정보 없이 안내한다.

### 학습자 API

| 메서드·경로 | 역할 |
|---|---|
| `GET /api/learner/session` | 현재 기기 연결의 최소 별칭·서버 진행 |
| `POST /api/learner/practice-sessions` | 현재 learner의 승인 릴리스로 연습 회기 시작 |
| `GET /api/learner/practice-sessions/:id/current` | 현재 문항·보기·승인 음원. 제출 전 정답은 응답에서 제외 |
| `POST /api/learner/events` | 해당 learner/session의 이벤트 묶음 검증·멱등 저장 |
| `POST /api/learner/responses` | 첫 제출/재시도. 서버가 문항 판으로 정답 판정 후 피드백 반환 |
| `POST /api/learner/logout` | 현재 기기 세션 폐기·쿠키 제거 |

사용자 식별은 서버 세션에서 한다. 학습자 API에서 teacher·다른 learner·임의 릴리스로 범위를 확장할 수 없어야 한다. 이벤트에 기록한 문항 ID도 실제로 해당 회기에 배정된 문항인지 확인한다.

## 이벤트 계약

기본 필드는 `client_event_id`, `session_id`, `presentation_id`, `item_version_id`, `seq`, 클라이언트 단조 시계 기준 시간, 이벤트 타입이다. 서버는 learner ID·수신 시각·릴리스·선택 정책·권한 검증 결과를 보충한다. 클라이언트 시각과 집계 값은 관찰용 데이터이며 완전한 부정 방지 측정으로 설명하지 않는다.

이벤트 타입은 회기 시작/종료, 문항 제시, 오디오 시작/끝/오류, 응답 제출, 피드백, 재시도, 건너뛰기, 화면 숨김/복귀, 긴 무응답 시작/끝을 구분한다. 별도 responses 요청을 쓰더라도 원시 이벤트와 같은 멱등 계약으로 연결해 이중 집계를 막는다.

| 값 | 정의 |
|---|---|
| `elapsed_ms` | 문항/회기의 실제 경과 시간 |
| `active_ms` | 화면이 보이고 최근 조작이 있거나 음원이 실제 재생 중인 구간. 유휴 임계값은 정책 판에 저장 |
| `audio_play_ms` | 실제 재생 구간의 합. 버퍼링 제외. active와 겹칠 수 있음 |
| `hidden_ms`, `idle_ms` | 숨김·긴 무응답 구간. 중첩 구간을 총시간 계산에서 두 번 빼지 않음 |
| `response_wait_ms` | 자극 종료부터 첫 응답까지. 중간 재청취·화면 숨김 등과 함께 해석 |
| `replays_before_first` | 첫 제출 전 실제 추가 재생 횟수 |

응답 타입은 정상 완료, 재생 중 응답, 재생 오류, 미응답을 구분한다. 오류·미재생을 일반 오답에 자동 편입하지 않는다. 재시도가 첫 제출을 갱신하지 않는다. 정오답과 소리 식별·ABX·뜻 이해를 각각 집계한다.

## 콘텐츠 입력 예시의 상태

초기 12개 후보는 아직 승인 DB 데이터가 아니다. 입력용 파일에는 최소한 다음 열을 둔다.

`source_entry_id, lexeme_key, sense_id, revision_id, word, pos, source_gloss, learner_definition, example, example_source, edit_reason, occurrence_id, written_jamo, surface_phoneme, word_position, previous_segment, following_vowel, process, stage_links, meaning_status, example_status, pronunciation_status, audio_status, reviewer, reviewed_at`

누락 검수 상태는 `unreviewed`, 음원 없음은 `missing`으로 처리한다. 프런트가 누락을 승인으로 추측하지 않게 검증한다. `sense_id`·의미를 확인하지 못한 행은 자동으로 운영 입력하지 않는다.

## 오류와 응답

권한 없음, 기기 만료, 사용할 수 없는 초대, 멱등 충돌, 미승인 콘텐츠, 음원 준비 안 됨, 동기화 실패를 구분한다. 앱에는 짧은 안내와 다음 행동을 보여주고, 내부 오류·SQL·비밀값은 노출하지 않는다. 오류 코드는 안정적으로 유지하고 상세 로그는 토큰을 마스킹한다.
