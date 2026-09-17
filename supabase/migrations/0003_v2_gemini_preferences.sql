-- MarketFit v2 — Instagram 제거 + 자연어 취향 분석(AI 인터뷰 / 키워드) 스키마
-- 적용: Supabase 대시보드 > SQL Editor에 붙여넣고 실행 (0001, 0002 이후)
--
-- 이 마이그레이션이 하는 일
--  1) Instagram(소셜 연동) 테이블과 관련 컬럼 제거
--  2) user_preferences에 분석 버전(analysis_version)·입력 방식·상황 정보 컬럼 추가
--  3) stores / store_features에 새 점포 데이터(djone 433개)용 컬럼 추가
--  4) 이전 40개 seed('jm-'로 시작하는 id) 정리
--  5) 공개 데이터(점포·feature)에만 anon 읽기 정책 추가 — 개인 데이터 테이블은 서버 전용 유지

-- ── 1. Instagram 관련 제거 ───────────────────────────────────
drop table if exists public.social_tokens cascade;
drop table if exists public.social_connections cascade;

alter table public.user_preferences drop column if exists instagram_keywords;
alter table public.user_preferences drop column if exists instagram_mode;
alter table public.user_preferences drop column if exists interest_inputs;

-- ── 2. 취향 분석 (버전 관리 + 자연어 입력) ────────────────────
alter table public.user_preferences add column if not exists analysis_id uuid;
alter table public.user_preferences add column if not exists analysis_version integer not null default 1;
alter table public.user_preferences add column if not exists input_mode text not null default 'keywords';
alter table public.user_preferences add column if not exists keywords jsonb not null default '[]'::jsonb;
-- 대화 원문은 저장하지 않습니다. 구조화된 상황 정보(목적·예산대·동행·상황·선호 스타일)만 담습니다.
alter table public.user_preferences add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists ai_model text;
alter table public.user_preferences add column if not exists is_active boolean not null default false;

update public.user_preferences set analysis_id = gen_random_uuid() where analysis_id is null;
alter table public.user_preferences alter column analysis_id set default gen_random_uuid();
alter table public.user_preferences alter column analysis_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_analysis_id_key') then
    alter table public.user_preferences add constraint user_preferences_analysis_id_key unique (analysis_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_input_mode_check') then
    alter table public.user_preferences add constraint user_preferences_input_mode_check check (input_mode in ('chat', 'keywords', 'both'));
  end if;
end $$;

create index if not exists user_preferences_version_idx on public.user_preferences (user_id, analysis_version desc);
create index if not exists user_preferences_active_idx on public.user_preferences (user_id, is_active) where is_active;
create index if not exists user_preferences_created_idx on public.user_preferences (created_at desc);

-- 사용자마다 활성 분석은 하나만
create unique index if not exists user_preferences_one_active_idx on public.user_preferences (user_id) where is_active;

-- 각 사용자의 가장 최근 기록을 활성으로 표시 (이전 데이터 보정)
with latest as (
  select distinct on (user_id) id from public.user_preferences order by user_id, created_at desc
)
update public.user_preferences p set is_active = true
from latest l
where p.id = l.id
  and not exists (select 1 from public.user_preferences a where a.user_id = p.user_id and a.is_active);

-- ── 3. 점포 데이터 (djone 433개) 컬럼 ────────────────────────
alter table public.stores add column if not exists source_ids integer[] not null default '{}';
alter table public.stores add column if not exists items text[] not null default '{}';
alter table public.stores add column if not exists items_raw text;
alter table public.stores add column if not exists categories_raw text;
alter table public.stores add column if not exists main_category text;
alter table public.stores add column if not exists sub_category text;
alter table public.stores add column if not exists address_clean text;
alter table public.stores add column if not exists zone text;
alter table public.stores add column if not exists loc_level text;
alter table public.stores add column if not exists collected_at date;

alter table public.store_features add column if not exists sub_category text;
alter table public.store_features add column if not exists inferred_by text;

-- 원본에 없는 값은 만들지 않으므로 phone_status·location_basis 값 범위를 새 파서에 맞춥니다.
alter table public.stores drop constraint if exists stores_phone_status_check;
alter table public.stores add constraint stores_phone_status_check check (phone_status in ('listed', 'none', 'check'));
alter table public.stores drop constraint if exists stores_entity_kind_check;
alter table public.stores add constraint stores_entity_kind_check check (entity_kind in ('store', 'street_vendor'));
alter table public.stores drop constraint if exists stores_location_basis_check;
alter table public.stores add constraint stores_location_basis_check
  check (location_basis in ('road_address', 'near_road_address', 'road_only', 'parcel_address', 'market_zone', 'none'));

-- ── 4. 이전 40개 seed 정리 (새 id는 'dj-' 접두사) ─────────────
delete from public.user_interactions where store_id like 'jm-%';
delete from public.recommendations where store_id like 'jm-%';
delete from public.merchant_insights where store_id like 'jm-%';
delete from public.store_features where store_id like 'jm-%';
delete from public.stores where id like 'jm-%';

-- ── 5. RLS ───────────────────────────────────────────────────
-- 개인 데이터(users, user_preferences, user_interactions, recommendations, app_settings)는
-- 정책을 만들지 않아 service_role만 접근합니다.
-- 점포 정보는 공개 데이터이므로 anon 키로 읽기만 허용합니다(쓰기는 서버 전용).
drop policy if exists "stores are public" on public.stores;
create policy "stores are public" on public.stores for select to anon, authenticated using (true);
drop policy if exists "store features are public" on public.store_features;
create policy "store features are public" on public.store_features for select to anon, authenticated using (true);

revoke insert, update, delete on public.stores from anon, authenticated;
revoke insert, update, delete on public.store_features from anon, authenticated;
grant select on public.stores to anon, authenticated;
grant select on public.store_features to anon, authenticated;
