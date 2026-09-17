import { findDictionaryWords } from "@/lib/recommendation/keywords";
import { round3 } from "@/lib/recommendation/dimensions";
import type { InstagramInterest } from "./InstagramDataProvider";

const HASHTAG_RE = /#([\p{L}\p{N}_]{2,30})/gu;
const STOP_TAGS = new Set(["일상", "daily", "instagood", "follow", "좋아요", "맞팔", "선팔", "photo", "ootd_", "l4l", "f4f", "데일리"]);

/**
 * 본인 게시물 캡션에서 관심 키워드를 추출합니다.
 * - 해시태그 + 취향 사전 단어
 * - 최신 게시물일수록 가중치를 조금 더 줍니다.
 */
export function extractInterests(captions: { caption: string | null; timestamp: string | null }[], max = 15): InstagramInterest[] {
  const weights = new Map<string, number>();
  const sorted = [...captions].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  sorted.forEach((item, index) => {
    if (!item.caption) return;
    const recency = 1 - Math.min(index, 20) / 40; // 1.0 → 0.5
    const text = item.caption.toLowerCase();
    const found = new Set<string>();
    for (const match of text.matchAll(HASHTAG_RE)) {
      const tag = match[1]!.replace(/_/g, "");
      if (!STOP_TAGS.has(tag) && !/^\d+$/.test(tag)) found.add(tag);
    }
    for (const hit of findDictionaryWords(text, { keepSpaces: true })) found.add(hit.word);
    for (const f of found) weights.set(f, (weights.get(f) ?? 0) + recency);
  });
  const entries = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const top = entries[0]?.[1] ?? 1;
  return entries.map(([keyword, w]) => ({ keyword, score: round3(0.4 + 0.55 * (w / top)) }));
}

export function sampleCaptions(captions: { caption: string | null }[], count = 5, maxLength = 80): string[] {
  return captions
    .map((c) => (c.caption ?? "").replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 0)
    .slice(0, count)
    .map((c) => (c.length > maxLength ? `${c.slice(0, maxLength)}…` : c));
}
