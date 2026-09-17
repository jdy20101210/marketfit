import { getPublicModes } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { handle, ok } from "@/lib/http";

/** 배포 확인용 상태 (비밀 값·개인정보 없음) */
export const GET = handle(async () => {
  const modes = await getPublicModes();
  return ok({ status: "ok", modes, storage: getRepository().info().kind, time: new Date().toISOString() });
});
