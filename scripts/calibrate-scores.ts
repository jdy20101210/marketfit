/**
 * 추천 점수 분포 점검: 대표 취향 예시별로 80점(기본)·75점(보조) 기준을 넘는 점포 수를 출력합니다.
 * 점포 데이터나 feature 규칙을 바꾼 뒤 추천 기준이 여전히 적절한지 확인할 때 사용합니다.
 *
 * 실행: npm run data:calibrate
 */
import features from "../data/stores/store-features.json";
import seed from "../data/stores/stores.seed.json";
import { toVector, type TasteVector } from "../lib/recommendation/dimensions";
import { rankStores, RECOMMEND_FALLBACK_SCORE, RECOMMEND_MIN_SCORE, selectRecommended } from "../lib/recommendation/engine";
import { vectorFromKeywords } from "../lib/recommendation/keywords";

const inputs = features.features.map((f) => ({
  id: f.storeId,
  taste: toVector(f.taste),
  market: f.market,
  exposure: f.exposure,
  recommendable: f.recommendable,
  productHints: f.productHints,
}));
const byId = new Map(seed.stores.map((s) => [s.id, s]));
const kw = (words: string[]) => vectorFromKeywords(words.map((keyword) => ({ keyword, score: 0.9 }))).vector;

const PROFILES: Record<string, TasteVector> = {
  "지침 예시: 대전만의 독특한 2만원 선물": toVector({ gift: 0.94, local: 0.91, discovery: 0.89, practical: 0.55, price_sensitive: 0.5 }),
  "키워드: 커피·캠핑·선물·빈티지·전통시장": kw(["커피", "캠핑", "선물", "빈티지", "전통시장"]),
  "키워드: 커피": kw(["커피"]),
  "키워드: 캠핑·선물": kw(["캠핑", "선물"]),
  "전통·한복": toVector({ traditional: 0.9, fashion: 0.5, family: 0.6 }),
  "시장 먹거리": toVector({ food: 0.95, dessert: 0.7, local: 0.8, travel: 0.5 }),
  "옷 쇼핑(가성비)": toVector({ fashion: 0.9, practical: 0.5, price_sensitive: 0.6 }),
  "캠핑 장비": toVector({ camping: 0.95, practical: 0.6, travel: 0.5 }),
  "홈카페·주방": toVector({ coffee: 0.9, kitchen: 0.8, living: 0.5 }),
  "집 꾸미기": toVector({ living: 0.9, craft: 0.4, vintage: 0.5 }),
  "부모님 선물": toVector({ family: 0.9, gift: 0.85, traditional: 0.6, food: 0.5 }),
  "빈티지": toVector({ vintage: 0.95, discovery: 0.8, fashion: 0.5 }),
};

for (const [name, taste] of Object.entries(PROFILES)) {
  const ranked = rankStores({ taste, recent: taste }, inputs);
  const sel = selectRecommended(ranked);
  const applied = sel.threshold === null ? "일치 점포 없음" : `${sel.threshold}점 기준${sel.usedFallback ? "(보조)" : ""}`;
  console.log(
    `${name}\n  최고 ${sel.bestScore}점 · ${RECOMMEND_MIN_SCORE}점↑ ${sel.counts.atPrimary}곳 · ${RECOMMEND_FALLBACK_SCORE}점↑ ${sel.counts.atFallback}곳 → ${applied}, 표시 ${sel.ranked.length}곳`,
  );
  console.log(
    `  ${sel.ranked
      .slice(0, 5)
      .map((r) => `${r.rank}위 ${r.score} ${byId.get(r.storeId)!.name}(${byId.get(r.storeId)!.subCategory})`)
      .join(" | ")}`,
  );
}
