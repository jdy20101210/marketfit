-- MarketFit v3 — 외부 AI(Gemini) 제거, 서비스 내장 챗봇 엔진으로 전환
-- 적용: Supabase 대시보드 > SQL Editor에 붙여넣고 실행 (0001~0003 이후)
--
-- 이 마이그레이션이 하는 일
--  1) ai_provider / reason_provider / description_provider 값을 내장 엔진 기준으로 정리
--  2) 'gemini' 값을 더 이상 쓰지 않도록 check 제약 교체
--  3) 더 이상 쓰지 않는 Gemini 모델 컬럼 값 비우기 (컬럼 자체는 이전 기록 호환을 위해 남겨 둡니다)

-- ── 1. 취향 분석 기록 ────────────────────────────────────────
update public.user_preferences set ai_provider = 'builtin' where ai_provider in ('gemini', 'mock');
update public.user_preferences set ai_model = null where ai_model is not null;

alter table public.user_preferences drop constraint if exists user_preferences_ai_provider_check;
alter table public.user_preferences add constraint user_preferences_ai_provider_check check (ai_provider in ('builtin'));

-- ── 2. 추천 이유 (점포 원본 데이터 기반 템플릿) ───────────────
update public.recommendations set reason_provider = 'template' where reason_provider is not null and reason_provider <> 'template';

alter table public.recommendations drop constraint if exists recommendations_reason_provider_check;
alter table public.recommendations add constraint recommendations_reason_provider_check check (reason_provider is null or reason_provider in ('template'));

-- ── 3. 점포 소개 문장 ────────────────────────────────────────
update public.store_features set description_provider = 'template', description_model = null where description_provider is not null;

alter table public.store_features drop constraint if exists store_features_description_provider_check;
alter table public.store_features add constraint store_features_description_provider_check
  check (description_provider is null or description_provider in ('template'));
