-- 학습자 설정: 예문 읽기 방식(2026-11-18 사용자 결정).
-- spoken = 말하듯이(문장 사이 <long pause>로 이어 읽힌 음원, 기본)
-- turns  = 또박또박(문장마다 칸을 나눠 읽힌 음원)
-- 운영 DB 적용은 사용자 확인 뒤에 한다. 적용 전에도 서버는 기본값 spoken으로 읽는다.
alter table public.phoneme_learners
  add column if not exists example_reading text not null default 'spoken'
  check (example_reading in ('spoken', 'turns'));
