-- 단어마다 예문을 최대 5개까지: 1번은 기존 example 칸, 2~5번은 extra_examples(최대 4개).
-- 기존 표에 칸 하나를 더한다(사용자 허락 2026-11-22). 기존 값·정책은 바꾸지 않는다. RLS는 그대로 켜져 있다.
alter table public.phoneme_content_items
  add column extra_examples text[] not null default '{}'::text[];

alter table public.phoneme_content_items
  add constraint phoneme_content_items_extra_examples_max
  check (cardinality(extra_examples) <= 4);
