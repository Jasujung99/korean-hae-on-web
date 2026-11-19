-- 성인 소리 학습 앱(apps/learn): 단어·예문·음원·게시본·TTS 사용량 표.
-- 기존 테이블은 바꾸지 않고 phoneme_ 접두사 객체만 추가한다.
-- 모든 표는 RLS를 켜고 정책을 두지 않는다. 서버가 secret 키로만 접근한다.

create table public.phoneme_content_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  group_id text not null check (group_id in ('j_ch_jj', 's_ss', 'g_k_kk', 'b_p_pp', 'd_t_tt')),
  stage text not null check (stage in ('Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5')),
  substage text check (substage is null or substage in ('1-A', '1-B')),
  consonant text not null,
  word text not null check (char_length(word) between 1 and 80),
  entry_id integer,
  pos text not null default '',
  gloss text not null default '',
  scene text not null default '',
  example text not null default '',
  related text not null default '',
  note text not null default '',
  sort_order integer not null default 0,
  source text not null check (source in ('roadmap_seed', 'teacher')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'hidden')),
  created_by uuid references public.phoneme_teachers (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index phoneme_content_items_group_stage_idx on public.phoneme_content_items (group_id, stage, sort_order);
create index phoneme_content_items_status_idx on public.phoneme_content_items (status);

create table public.phoneme_content_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.phoneme_content_items (id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  reason text,
  edited_by uuid references public.phoneme_teachers (user_id),
  created_at timestamptz not null default now(),
  unique (item_id, version)
);
create index phoneme_content_item_versions_item_idx on public.phoneme_content_item_versions (item_id, version desc);

create table public.phoneme_content_stage0 (
  id uuid primary key default gen_random_uuid(),
  group_id text not null check (group_id in ('j_ch_jj', 's_ss', 'g_k_kk', 'b_p_pp', 'd_t_tt')),
  consonant text not null,
  stimulus text not null,
  word text,
  context text not null check (context in ('medial_vcv', 'initial_high', 'initial_nonhigh')),
  kind text not null check (kind in ('pseudoword', 'cell')),
  sort_order integer not null default 0,
  unique (group_id, kind, stimulus, context)
);
create index phoneme_content_stage0_group_idx on public.phoneme_content_stage0 (group_id, sort_order);

create table public.phoneme_audio_assets (
  id uuid primary key default gen_random_uuid(),
  audio_id text not null,
  item_id uuid references public.phoneme_content_items (id) on delete set null,
  kind text not null check (kind in ('pseudo', 'syllable', 'word', 'sentence', 'sentence_turns', 'audition')),
  voice_key text not null,
  storage text not null check (storage in ('r2', 'local')),
  object_key text not null,
  mime text not null,
  bytes integer not null check (bytes >= 0),
  duration_ms integer,
  sha256 text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'superseded')),
  stale boolean not null default false,
  source text not null check (source in ('import', 'pc_batch', 'ui_single')),
  model text not null default '',
  style_prompt text,
  settings jsonb not null default '{}'::jsonb,
  text text not null default '',
  generated_at timestamptz,
  reviewed_by uuid references public.phoneme_teachers (user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (audio_id, storage, object_key)
);
create index phoneme_audio_assets_lookup_idx on public.phoneme_audio_assets (audio_id, status, created_at desc);
create index phoneme_audio_assets_item_idx on public.phoneme_audio_assets (item_id);
create index phoneme_audio_assets_status_idx on public.phoneme_audio_assets (status);

create table public.phoneme_content_releases (
  id uuid primary key default gen_random_uuid(),
  seq integer not null unique check (seq >= 1),
  released_by uuid references public.phoneme_teachers (user_id),
  released_at timestamptz not null default now(),
  note text,
  item_count integer not null check (item_count >= 0),
  audio_count integer not null check (audio_count >= 0),
  snapshot jsonb not null
);

create table public.phoneme_tts_usage (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  quota_day date not null,
  source text not null check (source in ('ui_single', 'pc_batch')),
  voice_key text not null,
  kind text not null,
  item_id uuid references public.phoneme_content_items (id) on delete set null,
  ok boolean not null,
  error_code text
);
create index phoneme_tts_usage_day_idx on public.phoneme_tts_usage (quota_day, source);

alter table public.phoneme_content_items enable row level security;
alter table public.phoneme_content_item_versions enable row level security;
alter table public.phoneme_content_stage0 enable row level security;
alter table public.phoneme_audio_assets enable row level security;
alter table public.phoneme_content_releases enable row level security;
alter table public.phoneme_tts_usage enable row level security;

revoke all on public.phoneme_content_items, public.phoneme_content_item_versions, public.phoneme_content_stage0,
  public.phoneme_audio_assets, public.phoneme_content_releases, public.phoneme_tts_usage from anon, authenticated;

grant select, insert, update, delete on public.phoneme_content_items, public.phoneme_content_item_versions, public.phoneme_content_stage0,
  public.phoneme_audio_assets, public.phoneme_content_releases, public.phoneme_tts_usage to service_role;
