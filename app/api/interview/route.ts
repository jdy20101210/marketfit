import { InterviewRequestSchema } from "@/lib/api/schemas";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { runInterviewTurn } from "@/lib/services/preferenceService";

export const maxDuration = 30;

/**
 * AI 인터뷰 한 턴: 지금까지의 대화 → 다음 질문(최대 6개) 또는 분석 준비 완료
 * 대화 원문은 서버에 저장하지 않습니다(내장 챗봇 엔진이 그 자리에서 해석만 합니다).
 */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "interview", { perClient: 60, global: 1500, windowMs: 10 * 60 * 1000 });
  const { messages } = await readJson(request, InterviewRequestSchema);
  return ok(await runInterviewTurn(messages));
});
