import { SaveProfileRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { ensureUserId } from "@/lib/security/session";

/** STEP 3-3: 취향 프로필 저장 (user_preferences) */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "profile", { perClient: 30, global: 600, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, SaveProfileRequestSchema);
  const userId = await ensureUserId();
  const repo = getRepository();
  await repo.savePreference({
    userId,
    tasteVector: body.taste,
    recentVector: body.recent,
    topCategories: body.topCategories,
    interestInputs: body.items,
    instagramKeywords: body.instagramKeywords,
    instagramMode: body.instagramMode,
    personaLabel: body.personaLabel,
    summary: body.summary,
    aiProvider: body.aiProvider,
    createdAt: new Date().toISOString(),
  });
  const info = repo.info();
  return ok({ storage: info.kind, persistent: info.persistent });
});
