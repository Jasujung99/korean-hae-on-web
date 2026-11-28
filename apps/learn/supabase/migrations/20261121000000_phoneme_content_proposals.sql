-- 단어 빈 칸 초안·뜻 정리 제안 표.
-- 학습자 화면이나 게시본(phoneme_content_releases)에는 들어가지 않으며,
-- 선생님이 콘텐츠 운영 화면(/teach/content)에서 검토·적용할 때만 phoneme_content_items로 반영된다.

create table if not exists public.phoneme_content_proposals (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.phoneme_content_items (id) on delete cascade,
  kind text not null check (kind in ('fill', 'cleanup')),
  fields jsonb not null default '{}'::jsonb,
  sense text not null default '',
  flags text[] not null default '{}',
  source text not null default 'ai_draft' check (source in ('ai_draft')),
  model text not null default '',
  prompt_version text not null default '',
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.phoneme_teachers (user_id),
  decided_at timestamptz
);

create index if not exists phoneme_content_proposals_item_status_idx
  on public.phoneme_content_proposals (item_id, status);

create index if not exists phoneme_content_proposals_status_idx
  on public.phoneme_content_proposals (status, created_at desc);

create unique index if not exists phoneme_content_proposals_pending_uniq
  on public.phoneme_content_proposals (item_id, prompt_version)
  where (status = 'pending');

alter table public.phoneme_content_proposals enable row level security;

revoke all on public.phoneme_content_proposals from anon, authenticated;

grant select, insert, update, delete on public.phoneme_content_proposals to service_role;
