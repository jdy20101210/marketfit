<p align="center"><img src="public/brand/marketfit-logo.png" alt="MarketFit" width="360"></p>

# MarketFit — AI가 발견하는 나만의 중앙시장

> 사람마다 좋아하는 것이 다르듯, 좋아할 시장도 다르다.

대전 중앙시장 40개 점포·상권을 대상으로, **Instagram 관심사 + 직접 입력한 관심 상품**을 AI(Gemini)가 분석해 취향 vector를 만들고, 점포 feature vector와 비교해 개인화 추천을 보여주는 Next.js 웹서비스입니다.

```
Instagram(Real/Mock) ─┐
                      ├─► Gemini(또는 Mock) 취향 분석 ─► 취향 프로필 ─► 40개 점포 매칭(cosine) ─► Kakao 취향 지도 ─► 점포 상세
관심 상품 3~5개 ───────┘
```

- **외부 API 키가 하나도 없어도 전체 흐름이 동작합니다** (Mock/데모 모드).
- 키는 `.env` 또는 배포 후 **관리자 화면(`/admin/integrations`)에서 입력**하면 자동으로 실제 API(REAL)로 전환됩니다.
- Google 로그인·Google Activity·Data Portability 관련 코드는 없습니다. (AI 분석에만 Gemini API 사용)

---

## 1. 빠른 시작 (로컬)

```bash
npm install
cp .env.example .env.local   # 값은 비워둬도 됩니다
npm run dev                  # http://localhost:3000
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:3000). 관리자 화면은 비밀번호 없이 열림 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 (배포 환경은 `ADMIN_PASSWORD` 필요) |
| `npm run seed` | Supabase에 40개 점포 + 추천 feature 입력 (`npm run db:seed`도 동일) |
| `npm run geocode` | Kakao Local API로 점포 좌표 조회 → `data/stores/store-locations.json` 갱신 (`-- --force`로 전체 재조회) |
| `npm test` | 단위 테스트 (추천 알고리즘, 데이터 변환, Gemini/Instagram/Kakao 어댑터 mock 테스트, 보안) |
| `npm run typecheck` / `npm run lint` | 타입 검사 / ESLint |
| `npm run data:convert` | 엑셀 원본 → `data/stores/stores.seed.json` 재변환 |
| `npm run data:features` | seed → 점포 추천 feature(`store-features.json`) 재생성 |

---

## 2. HTTPS 배포 (Vercel)

Vercel은 배포 즉시 `https://프로젝트명.vercel.app` 주소와 HTTPS 인증서를 자동으로 제공합니다.

### 2-1. 배포하기

1. 이 폴더를 GitHub 저장소로 올립니다.
   ```bash
   git init && git add . && git commit -m "MarketFit prototype"
   git branch -M main
   git remote add origin https://github.com/<내 계정>/marketfit.git
   git push -u origin main
   ```
2. [vercel.com](https://vercel.com) → **Add New… → Project** → 저장소 **Import** (Framework는 Next.js로 자동 인식)
3. **Environment Variables**에 최소 아래 2개를 넣고 **Deploy**
   | 이름 | 값 |
   | --- | --- |
   | `ADMIN_PASSWORD` | 관리자 비밀번호 (8자 이상) |
   | `APP_SECRET` | 32자 이상 임의 문자열 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
4. 배포가 끝나면 `https://marketfit-xxxx.vercel.app` 으로 접속합니다. (Settings → Domains에서 이름 변경 가능)

> CLI로 배포하려면: `npm i -g vercel` → `vercel login` → `vercel --prod` (환경변수는 `vercel env add ADMIN_PASSWORD production`)

### 2-2. 외부 서비스 연결 (배포 후)

1. `https://…vercel.app/admin` → 비밀번호 로그인 → **연동 설정 (키 입력)**
2. 화면에 표시되는 **사이트 도메인 / 리디렉션 URI / 콜백 URL**을 복사해 각 콘솔에 등록하고, 발급받은 키를 입력 → 저장 → **연결 테스트**
3. 저장 즉시 랜딩·온보딩·지도가 REAL 모드로 바뀝니다.

> ⚠️ **Vercel에서 DB 없이 운영하면** 관리자 화면에서 입력한 키는 서버 메모리에만 남아 인스턴스가 바뀌면 사라질 수 있습니다. 운영에서는 ① 같은 이름의 **Vercel 환경변수로 키를 등록**하거나 ② **Supabase를 연결**(아래 6장)하세요. 로컬(`npm run dev`)·자체 서버(`npm run start`)에서는 `.data/` 폴더에 암호화되어 저장됩니다.

---

## 3. 현재 실제 API 연동 상태

| 영역 | 구현된 실제 연동 | 키가 없거나 실패하면 |
| --- | --- | --- |
| **Instagram** | Instagram API with Instagram Login: 로그인 URL 생성(state 검증) → code 교환 → 장기 토큰(60일) 교환·갱신 → `/me`, `/me/media` 조회 → 본인 게시물 캡션·해시태그에서 관심 키워드 추출. 토큰은 서버에서 AES-256-GCM 암호화 후 DB에만 저장. 권한 해제(Deauthorize)·데이터 삭제 콜백(`signed_request` 검증) 구현 | `MockInstagramDataProvider` — 6개 취향 유형(캠핑/카페/전통/선물/가족/빈티지) 중 선택·무작위 |
| **Gemini** | `models/{model}:generateContent` + `responseMimeType: application/json` + `responseSchema` 구조화 출력 → Zod 검증·범위 보정 → 규칙 기반 vector와 25% 혼합. 모델이 없으면(404) `gemini-flash-latest` → `gemini-2.5-flash` 순으로 재시도. 상위 8개 점포의 추천 이유 생성, (선택) 관리자 화면에서 40개 점포 소개 문장 생성. 가격·전화번호·URL·평점·퍼센트·업력(○년 전통·원조)·순위·영업시간·주차 같은 확인 불가 사실이 들어간 문장은 폐기 | `MockGeminiProvider` — 한국어 키워드 사전(긴 단어 우선 매칭)으로 취향 vector 생성, 점수대별 템플릿 추천 이유, 원본 데이터 기반 점포 소개 |
| **Kakao 지도** | JavaScript SDK 동적 로드, 점포 marker(커스텀 오버레이), 같은 위치 묶음(15m), 클러스터러, 대략적 위치 점선 원, 카테고리·점수 필터, 모바일 목록/지도 전환 | 데모 안내도(주소별 도식, 실제 위치 아님을 표시) |
| **Kakao Local** | 서버에서 주소 → 좌표(`/v2/local/search/address`), 건물번호까지 일치하면 `exact`, 그 외 `approximate`, 못 찾으면 `unknown` | 좌표 없음 → 목록에 “위치 미확인”. JS 키만 있으면 브라우저 SDK로 보완(저장 안 함) |
| **Supabase** | users / user_preferences / user_interactions / stores / store_features / recommendations / merchant_insights / social_connections / social_tokens / app_settings. RLS 활성화 + 정책 없음(service_role 전용). 삭제 요청은 Supabase와 대체 저장소 모두에서 수행 | 로컬 파일(`.data/`) 또는 메모리. Supabase 호출 실패 시 자동 대체 |
| **상인 인사이트** | 좋아요·찜·방문한 이용자(5명 이상)의 최신 취향을 익명 집계 → `merchant_insights`에 스냅샷 저장(5분간 재사용). 개인 식별 정보 없음 | 데모 데이터 (데모 페르소나 기반, 화면에 “데모 데이터” 표시, 저장하지 않음) |

**검증 범위(중요):** 이 코드를 만든 개발 환경은 Kakao·Meta·Google 서버에 접속할 수 없어, **실제 키로 호출하는 테스트는 하지 못했습니다.** 대신 ① 공식 문서의 요청·응답 형식으로 만든 mock 응답 단위 테스트(`tests/providers.test.ts`), ② 잘못된 키/차단된 네트워크에서 데모 모드로 자연스럽게 대체되는지(E2E), ③ Instagram 로그인 리디렉션·state 검증·오류 복귀를 확인했습니다. 실제 키를 넣은 뒤 관리자 화면의 **연결 테스트**로 먼저 확인하세요.

### Mock으로 동작하는 부분 (키가 없을 때)

- Instagram 연결 → “현재 데모 모드로 취향을 분석합니다.” 표시 + 데모 취향 유형
- AI 분석·추천 이유 → 키워드 사전 + 템플릿 (분석 화면에 “데모/대체”로 표시), 점포 소개 → 원본 데이터 기반 템플릿
- 지도 → 데모 안내도, 좌표 → 위치 미확인
- DB → 로컬 파일/메모리, 상인 인사이트 → 데모 데이터

---

## 4. 추후 Meta(Instagram) 설정이 필요한 부분

1. [Meta for Developers](https://developers.facebook.com/apps) → 앱 만들기 → Instagram 사용 사례 추가
2. 앱 대시보드 → **Instagram → API setup with Instagram login → Set up Instagram business login**
   - **OAuth redirect URIs**: `https://<배포주소>/api/instagram/callback` (관리자 화면에 표시되는 값과 정확히 일치)
   - **Deauthorize callback URL**: `https://<배포주소>/api/instagram/deauthorize`
   - **Data deletion request URL**: `https://<배포주소>/api/instagram/data-deletion`
   - 앱 설정의 **개인정보처리방침 URL**: `https://<배포주소>/privacy`
3. 같은 화면의 **Instagram 앱 ID / Instagram 앱 시크릿** → `META_APP_ID`, `META_APP_SECRET` (Facebook 앱 ID와 다를 수 있음)
4. 앱이 **개발 모드**인 동안은 앱 역할(Roles)에 **Instagram 테스터**로 등록하고 초대를 수락한 계정만 로그인할 수 있습니다.
5. 연결할 계정은 **Instagram 프로페셔널 계정(비즈니스·크리에이터)** 이어야 합니다. 개인(일반) 계정은 이 API로 조회할 수 없습니다.
6. 일반 사용자에게 공개하려면 `instagram_business_basic` 권한 **앱 검수(Advanced Access)** 와 비즈니스 인증이 필요합니다.
7. 사용하는 데이터: 본인 프로필(사용자명·계정 유형·게시물 수)과 최근 게시물 캡션만. 좋아요·팔로우·타인 게시물·검색 기록은 조회하지 않습니다(비공식 API·스크래핑 없음).

> 실제 호출 코드는 `lib/providers/instagram/instagramApi.ts`(HTTP adapter)와 `RealInstagramDataProvider.ts`에 분리되어 있습니다. 검수 범위가 바뀌면 이 두 파일만 수정하면 됩니다.

---

## 5. Kakao / Gemini 설정

### Kakao
1. [Kakao Developers](https://developers.kakao.com/console/app) → 애플리케이션 추가
2. **[앱] > [플랫폼 키]** 에서 JavaScript 키 → `NEXT_PUBLIC_KAKAO_JS_KEY`, REST API 키 → `KAKAO_REST_API_KEY`
3. **[앱] > [플랫폼 키] > [JavaScript 키] > JavaScript SDK 도메인** 에 `https://<배포주소>` (로컬은 `http://localhost:3000`) 등록
4. **[카카오맵] > 사용 설정 ON** (미설정 시 지도·로컬 API가 거부됨)
5. REST API 키의 호출 허용 IP는 비워두세요 (Vercel 서버 IP는 고정되지 않음)
6. `npm run geocode`(로컬) 또는 관리자 화면의 **빈 좌표 채우기**로 좌표를 저장합니다. DB 없이 배포한다면 로컬에서 `npm run geocode` 후 생성된 `data/stores/store-locations.json`을 커밋하면 배포본에도 좌표가 포함됩니다.

### Gemini
1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키 발급 → `GEMINI_API_KEY`
2. 모델(`GEMINI_MODEL`)을 비우면 `gemini-flash-latest`(최신 Flash 별칭) 사용. 관리자 화면의 연결 테스트에서 사용 가능한 모델 목록을 볼 수 있습니다.

---

## 6. Supabase (선택)

1. [Supabase](https://supabase.com/dashboard) 프로젝트 생성
2. **SQL Editor**에 `supabase/migrations/0001_init.sql`, `0002_store_descriptions.sql`을 순서대로 붙여넣고 실행
3. **Project Settings → API** 의 URL과 `service_role` 키를 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수로 등록 후 재배포
4. 관리자 화면 **Supabase에 40개 점포 seed** 클릭 (또는 로컬에서 `npm run seed`)

`service_role` 키는 서버에서만 사용합니다. 절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

---

## 7. 화면 구성

| 경로 | 내용 |
| --- | --- |
| `/` | 랜딩 — 중앙시장 입구 사진 배경, [Instagram으로 취향 분석] [관심 상품 직접 입력] [둘 다 사용하기] |
| `/onboarding` | Instagram 연결(실제/데모) + 관심 상품 3~5개 입력 |
| `/analysis` | 단계별 실제 API 호출 상태(관심사 → AI 분석 → 프로필 저장 → 점포 매칭 → 추천 이유) |
| `/profile` | 취향 페르소나, 취향 vector 막대(최근 관심 눈금), 분석 근거, 추천 점포, 좋아요·찜·방문 목록, 내 데이터 삭제 |
| `/market-map` | AI 시장 지도 (Kakao/데모), 카테고리·점수 필터, 같은 위치 묶음, 위치 정확도 표시, 선택 카드 |
| `/store/[id]` | 점포 소개(AI 또는 원본 데이터 기반)·“왜 나에게 추천됐나요?”·점수 구성·나와 맞는 취향·점포 성향·중앙시장 특성·원본 정보·좋아요/찜/방문/관심 없음 |
| `/admin` | 연동 상태(Gemini CONNECTED/NOT CONFIGURED, Instagram·Map REAL/MOCK), 연결 테스트, 좌표 갱신, seed, 점포 소개 생성, 점포·추천 태그·feature 표 |
| `/admin/integrations` | **키 입력 화면** — 설정 방법, 등록할 URL 복사, 암호화 저장, 연결 테스트, Instagram 로그인 테스트, Kakao 브라우저 로딩 테스트 |
| `/merchant` | 상인 인사이트 (익명 집계 / 데모 데이터), 추천 상품 아이디어 |
| `/privacy`, `/data-deletion` | 개인정보 처리 안내, 데이터 삭제 안내 (Meta 앱 설정에 필요) |

---

## 8. 추천 알고리즘

```
score_raw = 0.60·preference_fit + 0.15·recent_interest_fit + 0.10·market_experience_fit
          + 0.10·discovery_bonus + 0.05·interaction_feedback
```

- **preference_fit**: 사용자 취향 vector ↔ 점포 feature vector cosine similarity (17차원: 먹거리·디저트·커피·패션·잡화·리빙·주방·전통·선물·캠핑·여행·빈티지·가족·데이트·실용·수공예·로컬)
- **recent_interest_fit**: 직접 입력한 관심 상품만으로 만든 vector와의 유사도
- **market_experience_fit**: 중앙시장 특성 5종(`market_representativeness` 대표성·`historicalness` 역사성·`local_experience` 로컬 체험·`specialized_street` 특화 거리·`locality` 지역성) 평균 × 사용자의 로컬·전통·여행 관심 → 보조 역할
- **discovery_bonus**: `(1 − 노출도) × smoothstep(preference_fit)` — 덜 알려진 점포라도 취향이 맞을 때만 가산 (인기순 추천 방지). 노출도는 데이터 유형 기반 초기값 + 조회·반응 수로 보정
- **interaction_feedback**: 좋아요 +0.5, 찜 +0.7, 방문 +1, 관심 없음 −1, 조회 +0.05(최대 +0.15) → −1~1. 브라우저 상태와 서버에 기록된 행동 이력을 합쳐 계산하고, 행동이 없으면 0
- 표시 점수: `round(100 × (raw / 0.85)^0.65)` — 순서를 바꾸지 않는 단조 변환
- 추천 목록 다양화: 같은 유형이 연달아 나오지 않도록 순서만 조정(점수 불변), 지도 목록은 점수순
- 간단한 weight update: 긍정 행동 시 점포의 강한 성향 쪽으로 취향 vector를 조금 이동(학습률 0.08), 관심 없음은 반대로 조금 감소. 갱신된 취향은 서버(`user_preferences`)에도 기록
- 추천 이유 템플릿은 점수대별로 어조를 달리합니다(70점+ “잘 맞아요”, 55점+ “어느 정도 맞아요”, 그 미만은 단정하지 않음)
- **Gemini는 점수를 계산하지 않습니다.** 취향 분석과 추천 이유 문장 작성에만 사용합니다.

코드: `lib/recommendation/` (`engine.ts`, `feedback.ts`, `keywords.ts`, `reasons.ts`, `dimensions.ts`)

---

## 9. 데이터 원칙

- 초기 데이터는 첨부 엑셀 **`대전중앙시장_점포및상권_40개_수정.xlsx` → `점포_상권_40개` 시트의 40행만** 사용합니다. (`data/stores/source/`에 원본 보관, `npm run data:convert`로 재변환)
- 점포명·주소·연락처를 새로 만들지 않습니다. `연락처 확인 못함`·`미공개`는 그대로 표시합니다. (확인 28 / 확인 못함 8 / 미공개 4 — 원본 요약 시트와 일치)
- 점포 추천 성향은 **점포 유형과 비고에 적힌 품목만으로 추정**합니다. 점포명으로 품목을 추측하지 않습니다(예: ‘생선골목’은 유형이 ‘주방용품’이므로 주방용품으로만 해석). 규칙: `lib/stores/featureRules.ts`
- 위치 정확도: `exact`(건물번호까지 일치) / `approximate`(노점 ‘~앞’, ‘중앙시장 활성화구역’ 26곳은 원본 안내의 대표 주소 `대전로 783` 기준) / `unknown`(좌표 미확인). 좌표를 임의로 만들지 않습니다.
- 상인회(시장 관리 창구)는 지도에는 표시하지만 개인화 추천에서는 제외합니다.
- 영업 여부·세부 호수·연락처는 변동될 수 있으므로 공식 제출 전 전화 또는 현장 확인을 권장합니다(원본 주의사항).

---

## 10. 보안

- API 키·App Secret·service_role 키는 서버 코드(`server-only`)에서만 사용, 클라이언트 번들에 포함되지 않음. JavaScript 키(Kakao)만 공개 키로 전달
- 관리자 화면 입력값·Instagram 토큰은 AES-256-GCM 암호화 저장, 화면·응답에 값 미노출 (환경변수 > 관리자 입력 > 기본값)
- Instagram access token은 localStorage/쿠키에 넣지 않음. 브라우저에는 취향 결과와 표시 기록만 저장
- 관리자: `ADMIN_PASSWORD` + 서명된 HttpOnly/SameSite=Strict 세션, 배포 환경에서 비밀번호 미설정 시 잠금
- OAuth state 검증, 변경 요청 Origin 검사(CSRF), 요청 크기 제한, Zod 입력 검증(한국어 메시지)
- 요청 횟수 제한: 클라이언트별 + **전역 한도**. `X-Forwarded-For`는 Vercel 또는 `TRUST_PROXY=true`(리버스 프록시 뒤)일 때만 신뢰하므로 헤더 위조로 관리자 로그인 제한을 우회할 수 없습니다
- 보안 헤더(HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy), `/admin`·`/api` 검색 제외
- Meta `signed_request` HMAC 검증, 리디렉션 경로 검증(사이트 내부 경로만, 탭·개행 등 제어문자 거부)

---

## 11. 브랜드

| 파일 | 용도 |
| --- | --- |
| `public/brand/marketfit-logo.svg` | 공식 가로형 로고 (밝은 배경) |
| `public/brand/marketfit-logo-on-dark.svg` | 어두운 배경·사진 위 (워드마크 흰색) |
| `public/brand/marketfit-mark.svg` | 심볼(노란 차양 + 라임 그린 핀) |
| `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`, `public/brand/icon-*.png` | 파비콘·홈 화면 아이콘(`app/manifest.ts`) |
| `public/images/og-cover.jpg` | 공유 미리보기 (로고 + 중앙시장 입구 사진) |
| `components/layout/Logo.tsx` | 헤더·푸터·관리자·404에 쓰는 인라인 SVG 컴포넌트 (`logoPaths.ts` 자동 생성 데이터) |

- 색: 차양 노랑 `#f5cc5f`, 핀·Fit 라임 그린 `#bedb5e`, 워드마크 차콜 `#232621`. 사이트 색 토큰(`app/globals.css`)의 `sign-400`·`market-400`·`ink-900`이 로고 색이며, 텍스트용 짙은 단계(`market-600` 이상)는 명도 대비 4.5:1 이상으로 맞췄습니다.
- 로고 SVG는 사용자 제공 원본(`assets/brand/marketfit-logo-source.png`)을 색상별로 벡터화(potrace)한 것입니다.
- 사이트 배경은 첨부한 대전 중앙시장 입구 사진을 그대로 사용합니다(초록 차양 + 노란 간판 — 로고와 같은 색 조합).

---

## 12. 폴더 구조

```
app/                      페이지 + Route Handlers (app/api/**)
components/               UI (analysis, onboarding, profile, map, stores, admin, merchant, charts, ui)
lib/
  providers/
    instagram/            InstagramDataProvider, RealInstagramDataProvider, MockInstagramDataProvider, instagramApi(HTTP adapter)
    ai/                   GeminiProvider, MockGeminiProvider, schemas(JSON schema + Zod), prompts
    map/                  KakaoMapProvider(Local API), MockMapProvider, geocodeStores
  recommendation/         추천 알고리즘
  db/                     Repository 인터페이스, SupabaseRepository, LocalRepository(파일/메모리)
  config/integrations.ts  연동 설정 (env > 관리자 입력)
  security/               암호화, 세션, 관리자 가드
  stores/                 엑셀 파싱, feature 규칙, 점포 카탈로그, 점포 소개 템플릿
  services/               추천·상인 인사이트·점포 소개 생성·상태·Meta 콜백 서비스
data/stores/              seed JSON, feature JSON, 좌표 JSON, 엑셀 원본
public/brand/             공식 로고(SVG/PNG), 앱 아이콘
public/images/            중앙시장 사진(배경·히어로), 공유 미리보기 이미지
assets/brand/             로고 원본 이미지와 벡터 변환 스크립트
supabase/migrations/      DB 스키마 SQL (0001 기본, 0002 점포 소개)
scripts/                  convert-excel, build-features, seed, geocode
tests/                    vitest
```

---

## 13. 알려진 한계와 다음 단계

- Instagram API with Instagram Login은 **프로페셔널 계정만** 지원합니다. 일반 이용자 대상 서비스에서는 직접 입력이 주 경로가 됩니다.
- ‘활성화구역’ 26곳은 세부 위치가 원본에 없어 대략적 위치로만 표시됩니다. 현장 조사 후 `store-locations.json` 또는 DB의 좌표를 보완하세요.
- 점포 추천 성향은 유형 기반 추정치입니다. 상인 인터뷰로 취급 품목을 확인해 `store_features`를 보정하면 정확도가 올라갑니다.
- 요청 횟수 제한은 서버 인스턴스 메모리 기준입니다(서버리스에서는 인스턴스마다 따로 계산). 공개 운영 시 Upstash Redis 등으로 교체를 권장합니다.
- 회원 계정 없이 익명 쿠키로 동작합니다.
