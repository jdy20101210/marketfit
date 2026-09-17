-- MarketFit 초기 스키마 (Supabase PostgreSQL)
-- 적용: Supabase 대시보드 > SQL Editor에 붙여넣고 실행하거나 `supabase db push`
--
-- 보안 원칙
-- * 모든 테이블에 RLS를 켜고 공개 정책을 만들지 않습니다.
--   → anon/authenticated 키로는 접근 불가, 서버(service_role)만 읽고 씁니다.
-- * access token과 연동 키는 서버에서 AES-256-GCM으로 암호화한 값만 저장합니다.

create table if not exists public.users (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.stores (
  id text primary key,
  name text not null,
  store_type text not null,
  address_raw text,
  phone_raw text,
  phone text,
  phone_status text not null check (phone_status in ('verified', 'not_found', 'undisclosed', 'unknown')),
  source text,
  note text,
  entity_kind text not null check (entity_kind in ('store', 'street_vendor', 'arcade', 'product_zone', 'association')),
  geocode_query text,
  address_detail text,
  location_basis text,
  source_row integer,
  lat double precision,
  lng double precision,
  location_accuracy text not null default 'unknown' check (location_accuracy in ('exact', 'approximate', 'unknown')),
  location_note text,
  location_provider text,
  geocoded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_features (
  store_id text primary key references public.stores (id) on delete cascade,
  primary_category text not null,
  categories text[] not null default '{}',
  taste jsonb not null,
  market jsonb not null,
  exposure real not null default 0.5 check (exposure between 0 and 1),
  tags text[] not null default '{}',
  product_hints text[] not null default '{}',
  recommendable boolean not null default true,
  rationale text,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  taste_vector jsonb not null,
  recent_vector jsonb not null,
  top_categories jsonb not null default '[]'::jsonb,
  interest_inputs jsonb not null default '[]'::jsonb,
  instagram_keywords jsonb not null default '[]'::jsonb,
  instagram_mode text not null default 'none' check (instagram_mode in ('real', 'mock', 'none')),
  persona_label text,
  summary text,
  ai_provider text not null check (ai_provider in ('gemini', 'mock')),
  created_at timestamptz not null default now()
);
create index if not exists user_preferences_user_created_idx on public.user_preferences (user_id, created_at desc);

create table if not exists public.user_interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  store_id text not null references public.stores (id) on delete cascade,
  interaction_type text not null check (interaction_type in ('view', 'like', 'bookmark', 'dismiss', 'visit')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists user_interactions_user_idx on public.user_interactions (user_id, created_at desc);
create index if not exists user_interactions_store_idx on public.user_interactions (store_id, interaction_type);

create table if not exists public.recommendations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  store_id text not null references public.stores (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  rank integer not null,
  components jsonb not null,
  reason text,
  reason_provider text check (reason_provider in ('gemini', 'template')),
  created_at timestamptz not null default now()
);
create index if not exists recommendations_user_idx on public.recommendations (user_id, created_at desc);

-- 상인 인사이트: 익명 집계만 저장 (개인 식별 정보 없음)
create table if not exists public.merchant_insights (
  id bigint generated always as identity primary key,
  store_id text references public.stores (id) on delete cascade,
  period_start date,
  period_end date,
  distinct_users integer not null default 0,
  taste_distribution jsonb not null,
  interaction_counts jsonb not null default '{}'::jsonb,
  product_ideas jsonb not null default '[]'::jsonb,
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

-- Instagram 연결 상태 (토큰은 별도 테이블)
create table if not exists public.social_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null check (provider in ('instagram')),
  status text not null check (status in ('connected', 'disconnected', 'revoked', 'error')),
  external_user_id text,
  username text,
  account_type text,
  signals jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists social_connections_external_idx on public.social_connections (provider, external_user_id);

create table if not exists public.social_tokens (
  connection_id bigint primary key references public.social_connections (id) on delete cascade,
  access_token_encrypted text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 관리자 화면에서 입력한 연동 설정 (값은 서버에서 암호화)
create table if not exists public.app_settings (
  key text primary key,
  value_encrypted text not null,
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.stores enable row level security;
alter table public.store_features enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_interactions enable row level security;
alter table public.recommendations enable row level security;
alter table public.merchant_insights enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_tokens enable row level security;
alter table public.app_settings enable row level security;

-- 의도적으로 정책(policy)을 만들지 않습니다: service_role만 접근합니다.
revoke all on public.social_tokens from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;
