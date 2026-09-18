<p align="center"><img src="public/brand/marketfit-logo.png" alt="MarketFit" width="360"></p>

# MarketFit — AI가 발견하는 나만의 중앙시장

> 사람마다 좋아하는 것이 다르듯, 좋아할 시장도 다르다.

대전 중앙시장 **433개 점포·상권**을 대상으로, 사용자의 **자연어 취향**을 서비스 내장 챗봇 엔진이 해석해 취향 vector를 만들고, 점포 feature vector와 비교해 개인화 추천을 보여준 뒤, **몇 곳을 몇 시간 동안 돌지까지 동선으로 짜 주는** Next.js 웹서비스입니다.

```
AI 인터뷰 (대화 3~6문답) ─┐
                          ├─► 내장 챗봇 엔진 취향 해석 ─► UserPreferenceProfile ─► 433개 점포 매칭(cosine, 0~100점)
빠른 키워드 입력 ──────────┘                                                            │
                                                                                        ├─► 80점 이상만 순위와 함께 Kakao 지도·추천 목록
                                                                                        └─► 동선 계획: 「몇 곳 · 몇 시간」 → 걷는 순서 + 시간표
```

- **AI API 키가 필요 없습니다.** 취향 해석·추천 이유·홍보 아이디어는 **서비스 안의 챗봇 엔진**이 직접 만듭니다 (Gemini 등 외부 AI 호출 없음).
- 외부 연동은 **Kakao 지도**와 **Supabase(선택)** 뿐이고, 둘 다 없어도 전체 흐름이 동작합니다(데모 모드).
- 키는 `.env` 또는 배포 후 **관리자 화면(`/admin/integrations`)에서 입력**하면 자동으로 실제 API(REAL)로 전환됩니다.
- **Instagram·Meta·Google 로그인 관련 코드는 없습니다.**
- **추천 점수·순위는 AI가 아니라 알고리즘이 계산합니다.** 챗봇 엔진은 취향 해석과 설명 문장만 담당합니다.

---

## 1. 빠른 시작 (로컬)

```bash
npm install
cp .env.example .env.local   # 값은 비워둬도 됩니다
npm run dev                  # http://localhost:3000
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버. 관리자 화면은 비밀번호 없이 열림 |
| `npm run build` / `npm run start` | 프로덕션 빌드 / 서버 (배포 환경은 `ADMIN_PASSWORD` 필요) |
| `npm run seed` | Supabase에 433개 점포 + 추천 feature 입력 (`npm run db:seed`도 동일) |
| `npm run geocode` | Kakao Local API로 점포 좌표 조회 → `data/stores/store-locations.json` 갱신 (`-- --force`로 전체 재조회) |
| `npm test` | 단위 테스트 (추천 알고리즘, 취향 추출, 동선 계획, 데이터 변환, Kakao mock, 홍보 문구 검증, 보안) |
| `npm run typecheck` / `npm run lint` | 타입 검사 / ESLint |
| `npm run data:convert` | 엑셀 원본 → `data/stores/stores.seed.json` 재변환 |
| `npm run data:features` | seed → 점포 추천 feature(`store-features.json`) + 가상 집계 데이터 재생성 |
| `npm run data:calibrate` | 대표 취향 12종의 점수 분포 확인 (80점·75점 기준 점검) |

---

## 2. HTTPS 배포 (Vercel)

Vercel은 배포 즉시 `https://프로젝트명.vercel.app` 주소와 HTTPS 인증서를 자동으로 제공합니다.

1. GitHub 저장소로 올립니다.
   ```bash
   git add . && git commit -m "feat: marketfit v2"
   git push -u origin main
   ```
2. [vercel.com](https://vercel.com) → **Add New… → Project** → 저장소 **Import** (Framework는 Next.js로 자동 인식)
3. **Environment Variables**에 최소 아래 2개를 넣고 **Deploy**

   | 이름 | 값 |
   | --- | --- |
   | `ADMIN_PASSWORD` | 관리자 비밀번호 (8자 이상) |
   | `APP_SECRET` | 32자 이상 임의 문자열 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

4. 배포가 끝나면 `https://marketfit-xxxx.vercel.app` 으로 접속합니다. (Settings → Domains에서 이름 변경 가능)

### 운영 환경변수 (전체)

| 이름 | 용도 | 노출 범위 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 브라우저 지도 (공개 키, 도메인 등록 필요) | 브라우저 |
| `KAKAO_REST_API_KEY` | 주소 → 좌표 변환(Kakao Local) | **서버 전용** |
| `SUPABASE_URL` | DB 주소 | 서버 |
| `SUPABASE_ANON_KEY` | 공개 키 — 관리자 화면의 RLS 점검용 | 서버 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 전체 권한 | **서버 전용** |
| `ADMIN_PASSWORD`, `APP_SECRET` | 관리자 로그인·설정 암호화 | **서버 전용** |
| `APP_URL` (선택) | 공유 미리보기 절대 주소. 비우면 요청 주소 자동 사용 | 서버 |

> 주소를 코드에 적지 않습니다. 배포 URL은 `APP_URL` → Vercel이 주입하는 도메인 → 요청 헤더 순으로 결정합니다.

### 배포 후 외부 서비스 연결

1. `https://…vercel.app/admin` → 비밀번호 로그인 → **연동 설정 (키 입력)**
2. 화면에 표시되는 **사이트 도메인**을 Kakao 콘솔의 JavaScript SDK 도메인에 등록하고, 발급받은 키를 입력 → 저장 → **연결 테스트**
3. 저장 즉시 랜딩·취향 분석·지도가 REAL 모드로 바뀝니다.

> ⚠️ **Vercel에서 DB 없이 운영하면** 관리자 화면에서 입력한 키는 서버 메모리에만 남아 인스턴스가 바뀌면 사라질 수 있습니다. 운영에서는 ① 같은 이름의 **Vercel 환경변수로 키를 등록**하거나 ② **Supabase를 연결**(6장)하세요.

---

## 3. 사용자 흐름

| 단계 | 화면 | 내용 |
| --- | --- | --- |
| 1 | `/` | “지금 어떤 곳이나 상품을 찾고 있나요?” → **[AI와 대화하며 찾기] [키워드로 빠르게 분석하기]** |
| 2 | `/discover` | **AI 인터뷰**(최대 6개 질문, 이미 답한 건 다시 묻지 않음)와 **빠른 키워드**(최대 10개) 탭. 둘 다 입력하면 함께 분석 |
| 3 | `/analysis` | 취향 점수 시각화, 상황 정보(목적·예산·동행·상황·선호), 근거, **[추천 시장 보기] [다시 분석하기]** |
| 4 | `/market-map` | **80점 이상 점포만** 순위(01, 02 …)와 함께 지도·목록에 표시. 지도와 목록은 같은 순위 사용 |
| 5 | `/plan` | **동선 계획** — 「몇 군데 · 몇 시간」을 고르면 걷는 순서·도착 시각·도보 거리를 계산해 지도에 선으로 표시 |
| 6 | `/store/[id]` | 추천 이유, 점수 구성, 잘 맞는 취향, **원본 정보 / 추정 성향 분리 표시**, 좋아요·저장·방문·관심 없음 |
| — | `/profile` | 내 기록 — 활성 취향 프로필, 추천 요약, 저장·좋아요·방문 목록, 내 데이터 삭제 |
| — | `/merchant` | 상인 인사이트(집계 전용) + **AI 홍보 도우미** |
| — | `/market-insight` | 시장 전체 관심 카테고리, 관심 증가 분야, 관심 대비 방문이 적은 분야·점포 |
| — | `/admin`, `/admin/integrations` | AI 엔진·Supabase·Kakao·Mock 상태, 연결 테스트, 좌표 갱신, seed, 키 입력 |
| — | `/privacy`, `/data-deletion` | 개인정보 처리 안내, 데이터 삭제 안내 |

### AI 인터뷰 예시

```
AI    지금 중앙시장에서 무엇을 찾고 계세요?
사용자 친구 생일 선물을 찾고 있어요.
AI    좋아요! 예산은 어느 정도 생각하고 계세요?
사용자 2만원 정도요.
AI    흔하지 않은 대전만의 상품과 실용적인 상품 중 어느 쪽을 더 선호하시나요?
사용자 대전에서만 볼 수 있는 독특한 상품이 좋아요.
```

→ 두 입력 방식 모두 **같은 구조**의 `UserPreferenceProfile`을 만듭니다.

```jsonc
{
  "categories": { "gift": 0.94, "local": 0.91, "discovery": 0.89, "practical": 0.55 },
  "budget": { "min": null, "max": 20000 },
  "intent": "birthday_gift",
  "summary": "대전에서만 볼 수 있는 독특한 2만원 이하 선물을 선호"
}
```

**대화 원문은 서버에 저장하지 않습니다.** 분석할 때만 전송하고, 구조화된 취향 값·키워드·요약만 남깁니다.

### 다시 분석하기 (재분석)

상태는 `idle → analyzing → success | error` 네 가지이고, **`analyzing`일 때만 버튼이 비활성화**됩니다.
성공하면 `analysisVersion`이 1씩 올라가고(v1, v2, v3 …) 이전 결과는 지우지 않은 채 기록에 남으며, 최신 성공 결과가 활성 프로필이 됩니다. 기록에서 이전 버전을 다시 활성화할 수도 있습니다.

---

## 4. 추천 알고리즘

```
score_raw = 0.60·preference_fit + 0.15·recent_interest_fit + 0.10·market_experience_fit
          + 0.10·discovery_bonus + 0.05·interaction_feedback
표시 점수 = min(99, round(100 × (raw / 0.85)^0.65))     ← 순서를 바꾸지 않는 고정 변환
```

- **preference_fit** — 사용자 취향 vector ↔ 점포 feature vector **cosine similarity** (19차원)
  - 가중 cosine: 상품 분야(커피·캠핑·선물 등) 1.0, 상황·스타일(로컬·가족·가성비 등) 0.5. 상황 차원은 사용자가 그 성향을 드러낸 경우(0.2 이상)에만 계산에 넣어, 말하지 않은 상황 때문에 점수가 깎이지 않게 합니다.
  - 관심사가 여러 개면 **관심 분야 묶음(facet)별 cosine**도 계산해 가장 잘 맞는 값을 씁니다(0.95배 할인). 커피·캠핑·빈티지를 모두 좋아하는 사용자에게 커피 전문점도 제대로 된 점수가 나옵니다.
  - **‘새로운 발견’은 cosine에서 제외**합니다. 점포의 성질이 아니라 손님의 태도여서, 아래 `discovery_bonus`로만 반영합니다.
  - 점포가 그 분야를 실제로 얼마나 강하게 갖고 있는지를 곱해(묶음 비교는 0.3~1.0배), 성향이 옅은 점포가 vector 모양만 비슷해서 높은 점수를 받는 일을 막습니다.
- **recent_interest_fit** — 지금 찾는 것(대화의 목적·입력 키워드)과의 유사도
- **market_experience_fit** — 중앙시장 특성 5종(대표성·역사성·로컬 체험·특화 거리·지역성) × 로컬·전통·여행 관심 (보조)
- **discovery_bonus** — `(1 − 노출도) × smoothstep(preference_fit) × (0.5 + 0.5 × 사용자의 발견 선호)` — 덜 알려진 점포라도 취향이 맞을 때만 가산
- **interaction_feedback** — 좋아요 +0.5, 저장 +0.7, 방문 +1, 관심 없음 −1, 조회 +0.05(최대 +0.15)

### 추천 기준: 80점 (없으면 75점)

- 지도와 추천 목록에는 **80점 이상 점포만** 점수 내림차순 순위로 표시합니다.
- **80점 이상이 한 곳도 없을 때만** 기준을 75점으로 한 단계 낮추고, 화면에 “80점 이상 점포가 없어 75점 기준으로 보여줘요”라고 밝힙니다.
- 75점 이상도 없으면 “현재 취향과 높은 수준으로 일치하는 점포가 없습니다.”를 표시하고 다시 분석할 수 있게 합니다.
- **점수를 끌어올려 기준을 맞추지 않습니다.** 표시 변환은 사용자·결과와 무관한 고정식입니다.

`npm run data:calibrate` 결과 (대표 취향 12종, 433개 점포):

| 취향 예시 | 최고 | 80점↑ | 75점↑ |
| --- | ---: | ---: | ---: |
| 지침 예시(대전만의 독특한 2만원 선물) | 90 | 47 | 87 |
| 키워드 5개(커피·캠핑·선물·빈티지·전통시장) | 95 | 42 | 68 |
| 커피 | 92 | 7 | 7 |
| 캠핑 장비 | 94 | 2 | 2 |
| 빈티지 | 97 | 3 | 6 |
| 시장 먹거리 | 97 | 68 | 79 |
| 신호 없음(빈 입력) | 13 | 0 | 0 → “일치하는 점포 없음” |

**AI는 점수를 계산하지 않습니다.** 코드: `lib/recommendation/` (`engine.ts`, `feedback.ts`, `keywords.ts`, `reasons.ts`, `dimensions.ts`)

---

### 동선 계획 (`/plan`)

추천이 끝난 뒤 **“몇 군데를, 몇 시간 동안 돌까?”**를 고르면 걷는 순서와 시간표를 만듭니다.

```
추천 기준(80점, 없으면 75점) 통과 점포
   └─ 좌표가 확인된 곳만 후보
        ├─ 점포 선택   : 추천 순위 우선 + 같은 소분류 쏠림 방지(분류당 1곳 → 2곳 → 그 외)
        │                저장·좋아요한 점포는 [먼저 넣기] 체크 시 고정
        ├─ 순서 최적화 : 가까운 곳부터 잇고(nearest neighbour) 2-opt로 교차 제거
        ├─ 시간 배분   : 체류 = (총 시간 − 도보 시간) ÷ 점포 수, 8~30분으로 제한
        └─ 시간 초과 시: 점수가 낮은 점포부터 빼고 다시 계산 (체류를 8분 밑으로 줄이지 않음)
```

| 항목 | 값 |
| --- | --- |
| 방문 점포 수 | 2~8곳 |
| 총 시간 | 1시간 / 1시간 30분 / 2시간 / 3시간 / 4시간 (출발 시각 직접 입력) |
| 출발 지점 | 첫 점포 또는 **현재 내 위치**(브라우저 위치 권한, 저장하지 않음) |
| 도보 속도 | 67m/분(약 4km/h) |
| 거리 | 좌표 간 직선거리 × **1.3**(시장 골목 우회 보정) |

- 지도에는 방문 순서 marker와 이를 잇는 선(Kakao `Polyline`)을 그립니다. **선은 순서 안내용**이며 실제 골목 경로가 아니라는 점을 화면에 밝힙니다.
- 좌표가 없는 추천 점포는 **동선에 넣지 않고**, 몇 곳을 제외했는지 표시합니다(가짜 좌표를 만들지 않음).
- 점포마다 **카카오맵 길찾기 링크**(`map.kakao.com/link/to/...`)를 제공하고, 일정 전체는 텍스트로 복사할 수 있습니다.
- [다른 조합으로] 버튼은 같은 조건에서 그다음 후보 조합을 뽑습니다(추천 점수는 그대로).
- 계산은 전부 브라우저에서 즉시 수행합니다. 코드: `lib/route/plan.ts`, 테스트: `tests/route.test.ts`

---

## 5. 현재 실제 API 연동 상태

| 영역 | 구현된 실제 연동 | 키가 없거나 실패하면 |
| --- | --- | --- |
| **AI 엔진** | `BuiltinChatProvider` — 서버 안에서 도는 한국어 키워드 사전(긴 단어 우선)·문장 규칙 해석기. 인터뷰 다음 질문 선택, 취향 profile 생성, 키워드 의미 확장, 추천 이유, 점포 소개, 상인 홍보 아이디어를 담당합니다. **외부 네트워크 호출이 없어** 키·요금·장애·응답 지연이 없고, 같은 입력이면 항상 같은 결과가 나옵니다 | 해당 없음 (항상 동작) |
| **인터뷰 안전장치** | 질문 수(최대 6)·최소 답변 수(3)·같은 항목 반복 질문 금지·같은 문장 반복 금지를 **서버가 최종 결정**합니다 | — |
| **Kakao 지도** | JavaScript SDK 동적 로드, 순위 라벨 marker, 같은 위치 묶음, 클러스터러, 대략적 위치 점선 원, 카테고리 필터, 모바일 목록/지도 전환 | 데모 안내도(실제 위치 아님을 표시) |
| **Kakao Local** | 서버에서 주소 → 좌표(`/v2/local/search/address`). 건물번호까지 일치하면 `exact`, 그 외 `approximate`, 못 찾으면 `unknown`. 고유 질의 151건만 호출 | 좌표 없음 → 목록에 “위치 미확인”. JS 키만 있으면 브라우저 SDK로 보완(저장 안 함) |
| **Supabase** | users / user_preferences(버전 관리) / user_interactions / stores / store_features / recommendations / merchant_insights / app_settings. 개인 데이터는 RLS 정책 없음(service_role 전용), 점포 데이터만 anon 읽기 허용 | 로컬 파일(`.data/`) 또는 메모리. 호출 실패 시 자동 대체 |
| **상인·시장 인사이트** | 최근 7일 취향 기록을 **서로 다른 이용자 5명 이상**일 때만 실제 분포로 집계. 그 미만이면 프로토타입 가상 집계(고정값)를 표시하고 화면에 밝힘 | 가상 집계 |

**검증 범위(중요):** 이 코드를 만든 개발 환경은 Kakao 서버에 접속할 수 없어 **실제 키로 호출하는 테스트는 하지 못했습니다.** 대신 ① 공식 문서의 요청·응답 형식으로 만든 mock 응답 단위 테스트(`tests/providers.test.ts`), ② 잘못된 키/차단된 네트워크에서 데모 모드로 대체되는지, ③ 전체 흐름(인터뷰 → 분석 → 추천 → 재분석 → 인사이트) E2E를 확인했습니다. 실제 키를 넣은 뒤 관리자 화면의 **연결 테스트**로 먼저 확인하세요.

---

## 6. Kakao / Supabase 설정

### Kakao
1. [Kakao Developers](https://developers.kakao.com/console/app) → 애플리케이션 추가
2. **[앱] > [플랫폼 키]** 에서 JavaScript 키 → `NEXT_PUBLIC_KAKAO_JS_KEY`, REST API 키 → `KAKAO_REST_API_KEY`
3. **[JavaScript 키] > JavaScript SDK 도메인** 에 배포 주소(관리자 화면에 표시되는 사이트 도메인)를 등록. 로컬 개발은 `http://localhost:3000`도 추가
4. **[카카오맵] > 사용 설정 ON** (미설정 시 지도·로컬 API가 거부됨)
5. REST API 키의 호출 허용 IP는 비워두세요 (Vercel 서버 IP는 고정되지 않음)
6. `npm run geocode`(로컬) 또는 관리자 화면의 **빈 좌표 채우기**로 좌표를 저장합니다. DB 없이 배포한다면 로컬에서 `npm run geocode` 후 `data/stores/store-locations.json`을 커밋하세요.

### AI
설정할 것이 없습니다. 취향 해석·추천 이유·홍보 아이디어는 서버 안의 `BuiltinChatProvider`가 만듭니다. 동작 확인은 `/admin`의 **[AI 엔진] 연결 테스트**에서 실제 인터뷰 한 턴과 취향 분석을 돌려 봅니다.

### Supabase (선택)
1. [Supabase](https://supabase.com/dashboard) 프로젝트 생성
2. **SQL Editor**에 `supabase/migrations/`의 `0001_init.sql` → `0002_store_descriptions.sql` → `0003_v2_gemini_preferences.sql` → `0004_builtin_ai_engine.sql`을 **순서대로** 실행
3. **Project Settings → API** 의 URL·`anon`·`service_role` 키를 환경변수로 등록 후 재배포
4. 관리자 화면 **Supabase에 점포 seed** 클릭 (또는 로컬에서 `npm run seed`)

> `0003`은 Instagram 관련 테이블을 지우고, 분석 버전 컬럼과 새 점포 컬럼을 추가하며, 이전 40개 seed(`jm-` 접두사)를 정리합니다. `0004`는 외부 AI(Gemini) 흔적을 정리해 provider 값을 `builtin`/`template`로 맞춥니다.

---

## 7. 데이터 원칙

- 점포 데이터는 **`djone_stores_438.xlsx`** (대전중앙시장 공식 사이트 점포 목록, 438행 → 완전히 같은 행 5건을 합쳐 **433개 점포**)만 사용합니다. `npm run data:convert`로 재변환합니다.
- 대분류 4종 · **소분류 33종**(건어물·반찬, 축산물·정육, 한복, 커텐, 수예·자수, 귀금속·시계, 구제의류 …) — 이전 40개 데이터보다 훨씬 세분화되어 추천 정확도가 올라갑니다.
- **점포명·주소·연락처·품목을 새로 만들지 않습니다.** 연락처는 공개 333 / 없음 98 / 형식 확인 필요 2로 원본 상태를 그대로 표시합니다.
- **원본 정보와 AI 추정을 분리**합니다. API 응답도 `raw`(엑셀 원본)와 `inferred`(규칙·AI가 추정한 성향)로 나눠 내려주고, 점포 상세 화면도 두 영역을 따로 보여줍니다.
- 점포 추천 성향은 **소분류와 원본 품목 문자열만으로 추정**합니다. 점포명으로 품목을 추측하지 않습니다. 규칙: `lib/stores/featureRules.ts`
- 좌표는 원본에 없어 Kakao Local API로만 채웁니다. 위치 근거는 도로명 291 / 지번 79 / 건물 주변(노점) 25 / 도로명만 5 / 구역명만 30(대표 주소 `대전로 783` 기준) / 주소 없음 3으로 구분해 표시하고, **좌표를 임의로 만들지 않습니다.**
- 프로토타입 가상 집계(방문·좋아요·저장 수, 시장 관심도)는 **고정 시드로 생성**해 렌더링할 때마다 값이 바뀌지 않습니다(`data/mock/*.json`). 화면에 “프로토타입 가상 집계”임을 항상 밝힙니다.
- 영업 여부·세부 호수·연락처는 변동될 수 있으므로 공식 제출 전 전화 또는 현장 확인을 권장합니다.

---

## 8. 상인 인사이트와 AI 홍보 도우미

`/merchant` (점포별 또는 시장 전체), `/market-insight` (시장 전체)

- 최근 7일 관심도 분포, 관심이 늘어난 분야, **관심 대비 방문이 낮은 분야**, 점포별 관심 사용자·방문·좋아요·저장 수
- AI 홍보 도우미: ① 고객 관심사 요약 ② 관심 대비 방문 분석 ③ 상품·진열 아이디어 ④ 홍보 키워드 ⑤ SNS 문구 초안 ⑥ 이벤트 아이디어
- **개인 식별 정보를 제공하지 않습니다.** 계정·입력 내용·개별 방문 기록은 어떤 경로로도 반환하지 않고, 서로 다른 이용자 5명 미만이면 실제 집계 대신 가상 데이터만 보여줍니다.
- **없는 상품을 만들어내지 않습니다.** 원본 품목만 쓴 제안은 `원본 품목 기반`, 그 밖의 제안은 `아이디어(추정)`으로 표시하고, 가격·할인율·업력·평점·연락처처럼 확인할 수 없는 단정은 자동으로 걸러냅니다(`lib/merchant/promo.ts`).

---

## 9. 보안

- API 키·service_role 키는 서버 코드(`server-only`)에서만 사용하고 클라이언트 번들에 포함되지 않습니다. Kakao **JavaScript 키만** 공개 키로 브라우저에 전달합니다.
- **AI 해석은 전부 서버(Route Handler)에서** 이루어집니다. 브라우저는 `/api/*`만 호출하고, 대화 원문은 저장하지 않습니다.
- 관리자 화면 입력값은 AES-256-GCM으로 암호화해 저장하고 화면·응답에 값을 노출하지 않습니다 (환경변수 > 관리자 입력 > 기본값).
- `.env`, `.env.local`, `.env.*.local`은 `.gitignore`에 있습니다(`.env.example`만 커밋).
- 관리자: `ADMIN_PASSWORD` + 서명된 HttpOnly/SameSite=Strict 세션. 배포 환경에서 비밀번호 미설정 시 잠금.
- 변경 요청 Origin 검사(CSRF), 요청 크기 제한, Zod 입력 검증(한국어 메시지), 클라이언트별 + 전역 요청 한도(`X-Forwarded-For`는 Vercel 또는 `TRUST_PROXY=true`일 때만 신뢰).
- 보안 헤더(HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy), `/admin`·`/api` 검색 제외.
- Supabase RLS: 개인 데이터 테이블은 정책 없음(service_role 전용), 점포 데이터만 anon 읽기 허용. 관리자 **Database 연결 테스트**가 anon 키로 실제 차단 여부를 확인합니다.

---

## 10. 폴더 구조

```
app/                      페이지 + Route Handlers (app/api/**)
components/               UI (discover, analysis, profile, map, stores, admin, merchant, charts, layout, ui)
lib/
  preferences/            취향 타입, 규칙 기반 슬롯 추출, 규칙 profile 생성
  providers/
    ai/                   BuiltinChatProvider (서비스 내장 챗봇 엔진), 타입
    map/                  KakaoMapProvider(Local API), MockMapProvider, geocodeStores
  recommendation/         추천 알고리즘 (engine, keywords, feedback, reasons, dimensions)
  route/plan.ts           동선 계획 (점포 선택 → 2-opt 순서 최적화 → 시간표)
  merchant/promo.ts       홍보 아이디어 템플릿 + AI 응답 검증
  mock/                   결정적 가상 집계 생성기·리더
  db/                     Repository 인터페이스, SupabaseRepository, LocalRepository(파일/메모리)
  config/integrations.ts  연동 설정 (env > 관리자 입력)
  security/               암호화, 세션, 관리자 가드
  stores/                 엑셀 파싱, feature 규칙, 점포 카탈로그, 점포 소개 템플릿
  services/               인터뷰·분석·추천·인사이트·상태 서비스
data/stores/              seed JSON, feature JSON, 좌표 JSON, 엑셀 원본
data/mock/                고정 가상 집계 (점포 활동, 시장 관심도)
supabase/migrations/      DB 스키마 SQL (0001 기본, 0002 점포 소개, 0003 v2, 0004 내장 AI 엔진)
scripts/                  convert-excel, build-features, seed, geocode, calibrate-scores
tests/                    vitest (84개)
```

---

## 11. 브랜드

| 파일 | 용도 |
| --- | --- |
| `public/brand/marketfit-logo.svg` | 공식 가로형 로고 (밝은 배경) |
| `public/brand/marketfit-logo-on-dark.svg` | 어두운 배경·사진 위 (워드마크 흰색) |
| `public/brand/marketfit-mark.svg` | 심볼(노란 차양 + 라임 그린 핀) |
| `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` | 파비콘·홈 화면 아이콘(`app/manifest.ts`) |
| `public/images/og-cover.jpg` | 공유 미리보기 |

색: 차양 노랑 `#f5cc5f`, 핀·Fit 라임 그린 `#bedb5e`, 워드마크 차콜 `#232621`.

---

## 12. 알려진 한계와 다음 단계

- ‘활성화구역’ 30곳은 세부 위치가 원본에 없어 대표 주소 기준의 대략적 위치로만 표시됩니다. 현장 조사 후 좌표를 보완하세요.
- 점포 추천 성향은 소분류·품목 기반 추정치입니다. 상인 인터뷰로 취급 품목을 확인해 `store_features`를 보정하면 정확도가 올라갑니다.
- 방문·좋아요·저장 수는 실제 이용 기록이 쌓이기 전까지 프로토타입 가상 집계입니다.
- 요청 횟수 제한은 서버 인스턴스 메모리 기준입니다(서버리스에서는 인스턴스마다 따로 계산). 공개 운영 시 Upstash Redis 등으로 교체를 권장합니다.
- 회원 계정 없이 익명 쿠키로 동작합니다.
