-- 승인된 음성을 다시 만들 칸 표시(콘텐츠 운영 화면의 ⟳ "교체 예정").
-- 선생님이 검수하며 표시하고, 화면에서 [지금 만들기]나 [모두 만들기]로 새 초안을 만들면 서버가 표시를 지운다.
-- 학습자 화면과 게시본에는 쓰이지 않는다.

create table if not exists public.phoneme_audio_replace_marks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.phoneme_content_items (id) on delete cascade,
  kind text not null check (kind in ('word', 'sentence', 'sentence_turns')),
  example_index integer not null default 1 check (example_index between 1 and 5),
  voice_key text not null,
  marked_by uuid references public.phoneme_teachers (user_id),
  created_at timestamptz not null default now(),
  unique (item_id, kind, example_index, voice_key)
);

alter table public.phoneme_audio_replace_marks enable row level security;

revoke all on public.phoneme_audio_replace_marks from anon, authenticated;

grant select, insert, update, delete on public.phoneme_audio_replace_marks to service_role;
