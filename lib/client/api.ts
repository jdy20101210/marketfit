"use client";

import type { ApiResponse } from "@/lib/http-types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiClientError("네트워크 연결을 확인해주세요.", 0, "network_error");
  }
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    // 본문이 JSON이 아닌 경우
  }
  if (!json) throw new ApiClientError(`서버 응답을 해석할 수 없습니다 (HTTP ${res.status}).`, res.status, "invalid_response");
  if (!json.ok) throw new ApiClientError(json.error.message, res.status, json.error.code, json.error.details);
  return json.data;
}

export const api = {
  get: <T>(url: string, signal?: AbortSignal) => request<T>("GET", url, undefined, signal),
  post: <T>(url: string, body?: unknown, signal?: AbortSignal) => request<T>("POST", url, body ?? {}, signal),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}
