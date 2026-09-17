/** 서버/클라이언트 공용 API 응답 타입 */
export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
