import "server-only";
import { accessSync, constants, mkdirSync } from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/env";

let dataDirCache: string | null | undefined;

/**
 * 로컬 파일 저장소 경로.
 * - 개발 환경/자체 서버: <프로젝트>/.data (또는 MARKETFIT_DATA_DIR)
 * - Vercel 같은 서버리스: 파일 시스템이 영구적이지 않으므로 null (메모리 저장소 사용)
 */
export function getLocalDataDir(): string | null {
  if (dataDirCache !== undefined) return dataDirCache;
  const env = getEnv();
  if (env.VERCEL && !env.MARKETFIT_DATA_DIR) {
    dataDirCache = null;
    return dataDirCache;
  }
  // 런타임 전용 경로이므로 번들 파일 추적에서 제외합니다.
  const dir = env.MARKETFIT_DATA_DIR
    ? path.resolve(/*turbopackIgnore: true*/ env.MARKETFIT_DATA_DIR)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    dataDirCache = dir;
  } catch {
    dataDirCache = null;
  }
  return dataDirCache;
}
