import { getKakaoConfig, getPublicModes } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import type { PublicConfig } from "@/lib/api/schemas";
import { readInstagramCookie, readUserId } from "@/lib/security/session";

/** 클라이언트에 필요한 공개 설정만 반환합니다 (비밀 키 없음). */
export const GET = handle(async () => {
  const [modes, kakao, igCookie, userId] = await Promise.all([getPublicModes(), getKakaoConfig(), readInstagramCookie(), readUserId()]);
  const connected = Boolean(modes.instagram === "real" && igCookie && userId && igCookie.uid === userId);
  const data: PublicConfig = {
    modes: { ...modes, storage: getRepository().info().kind },
    // JavaScript 키는 브라우저 SDK용 공개 키입니다(카카오 콘솔의 도메인 제한으로 보호).
    kakaoJsKey: kakao.jsKey,
    instagram: {
      connected,
      username: connected ? igCookie!.username : null,
      mediaAnalyzed: connected ? igCookie!.mediaAnalyzed : 0,
    },
  };
  return ok(data);
});
