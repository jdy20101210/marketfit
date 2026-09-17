import { z } from "zod";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { resolveInstagramInterests } from "@/lib/services/instagramSession";

export const maxDuration = 30;

const Body = z.object({
  personaId: z.string().max(30).nullable().optional(),
  preferDemo: z.boolean().optional(),
});

/** STEP 3-1: Instagram 관심사 불러오기 (Real → Mock 순서) */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "ig-interests", { perClient: 30, global: 600, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, Body);
  const { data, demoReason } = await resolveInstagramInterests(body);
  // 캡션 원문은 서버 분석에만 쓰고 클라이언트로 보내지 않습니다.
  return ok({
    mode: data.mode,
    demoReason,
    username: data.username,
    mediaAnalyzed: data.mediaAnalyzed,
    interests: data.interests,
    personaId: data.personaId,
    personaLabel: data.personaLabel,
    fetchedAt: data.fetchedAt,
  });
});
