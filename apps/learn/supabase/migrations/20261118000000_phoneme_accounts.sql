-- 성인 소리 학습 앱(apps/learn): 교사·학습자·개인 초대·기기 세션·학습 기록.
-- 어린이 앱과 같은 프로젝트를 쓰므로 phoneme_ 접두사 객체만 추가한다. 기존 테이블·역할·정책은 건드리지 않는다.
-- 모든 표는 RLS를 켜고 정책을 두지 않는다. 브라우저 키(anon·authenticated)로는 읽고 쓸 수 없고,
-- 같은 origin 학습 서버가 secret 키로만 접근한다. 서버는 요청마다 쿠키 세션으로 학습자·교사를 정한다.

create table public.phoneme_teachers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table public.phoneme_learners (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.phoneme_teachers (user_id),
  nickname text not null check (char_length(nickname) between 1 and 40),
  class_label text check (class_label is null or char_length(class_label) <= 40),
  home_language text check (home_language is null or home_language in ('ru')),
  dict_language text not null default 'ru' check (dict_language in ('ru', 'en')),
  ui_style text not null default 'canvas' check (ui_style in ('proto', 'canvas')),
  practice_voice text not null default 'charon' check (practice_voice ~ '^[a-z]{2,20}$'),
  item_kind text not null default 'word' check (item_kind in ('word', 'pseudo')),
  status text not null default 'active' check (status in ('active', 'archived')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index phoneme_learners_teacher_idx on public.phoneme_learners (teacher_id);

create table public.phoneme_invitations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.phoneme_learners (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.phoneme_teachers (user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  claim_key_hash text,
  device_session_id uuid
);
create index phoneme_invitations_learner_idx on public.phoneme_invitations (learner_id);

create table public.phoneme_device_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.phoneme_learners (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  device_label text check (device_label is null or char_length(device_label) <= 80)
);
create index phoneme_device_sessions_learner_idx on public.phoneme_device_sessions (learner_id);

create table public.phoneme_teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.phoneme_teachers (user_id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

-- 학습 기록은 덧붙이기만 한다. 회기·응답·관찰 요약은 이 기록에서 계산한다.
create table public.phoneme_events (
  learner_id uuid not null references public.phoneme_learners (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9-]{8,64}$'),
  session_id text,
  seq integer not null default 0,
  type text not null check (type ~ '^[a-z_]{2,40}$'),
  client_time timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  primary key (learner_id, id)
);
create index phoneme_events_learner_received_idx on public.phoneme_events (learner_id, received_at);

create table public.phoneme_app_settings (
  key text primary key check (key ~ '^[a-zA-Z_]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.phoneme_teachers enable row level security;
alter table public.phoneme_learners enable row level security;
alter table public.phoneme_invitations enable row level security;
alter table public.phoneme_device_sessions enable row level security;
alter table public.phoneme_teacher_sessions enable row level security;
alter table public.phoneme_events enable row level security;
alter table public.phoneme_app_settings enable row level security;

revoke all on public.phoneme_teachers, public.phoneme_learners, public.phoneme_invitations,
  public.phoneme_device_sessions, public.phoneme_teacher_sessions, public.phoneme_events,
  public.phoneme_app_settings from anon, authenticated;

grant select, insert, update, delete on public.phoneme_teachers, public.phoneme_learners, public.phoneme_invitations,
  public.phoneme_device_sessions, public.phoneme_teacher_sessions, public.phoneme_events,
  public.phoneme_app_settings to service_role;

-- 초대 소비: 확인·소비·기기 세션 발급을 한 트랜잭션에서 한다.
-- 같은 claim 키로 짧은 시간 안에 다시 오면(응답 유실 후 재시도) 같은 결과를 돌려준다.
create or replace function public.phoneme_claim_invitation(
  p_token_hash text,
  p_claim_key_hash text,
  p_session_hash text,
  p_session_expires timestamptz,
  p_device_label text
) returns table (status text, learner_id uuid, device_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.phoneme_invitations%rowtype;
  new_session uuid;
begin
  select * into inv from public.phoneme_invitations i where i.token_hash = p_token_hash for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid;
    return;
  end if;
  if inv.consumed_at is not null then
    if inv.claim_key_hash = p_claim_key_hash and inv.consumed_at > now() - interval '10 minutes' then
      return query select 'replayed'::text, inv.learner_id, inv.device_session_id;
    else
      return query select 'used'::text, null::uuid, null::uuid;
    end if;
    return;
  end if;
  if inv.revoked_at is not null then
    return query select 'revoked'::text, null::uuid, null::uuid;
    return;
  end if;
  if inv.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid;
    return;
  end if;
  insert into public.phoneme_device_sessions (learner_id, token_hash, expires_at, device_label)
    values (inv.learner_id, p_session_hash, p_session_expires, left(p_device_label, 80))
    returning id into new_session;
  update public.phoneme_invitations
    set consumed_at = now(), claim_key_hash = p_claim_key_hash, device_session_id = new_session
    where id = inv.id;
  return query select 'claimed'::text, inv.learner_id, new_session;
end;
$$;

revoke all on function public.phoneme_claim_invitation(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.phoneme_claim_invitation(text, text, text, timestamptz, text) to service_role;
