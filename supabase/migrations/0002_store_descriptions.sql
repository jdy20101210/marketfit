-- MarketFit 0002: 점포 소개 문장(선택 기능) 저장 컬럼
-- 관리자 화면 [점포 소개 생성]이 Gemini(또는 원본 데이터 기반 템플릿)로 만든 문장을 저장합니다.
-- Supabase SQL Editor에서 0001 다음에 실행하세요.

alter table public.store_features add column if not exists description text;
alter table public.store_features add column if not exists description_provider text
  check (description_provider is null or description_provider in ('gemini', 'template'));
alter table public.store_features add column if not exists description_model text;
alter table public.store_features add column if not exists description_updated_at timestamptz;
