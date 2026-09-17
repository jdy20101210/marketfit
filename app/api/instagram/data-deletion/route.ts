import { NextResponse, type NextRequest } from "next/server";
import { fail, getRequestOrigin, handle, ok } from "@/lib/http";
import { handleDataDeletion, readDeletionCode, readSignedRequest } from "@/lib/services/metaCallbacks";

/** Meta 앱 설정의 "Data deletion request URL" — 응답 형식: { url, confirmation_code } */
export const POST = handle(async (request: NextRequest) => {
  const externalUserId = await readSignedRequest(request);
  const code = await handleDataDeletion(externalUserId);
  const url = new URL("/data-deletion", getRequestOrigin(request));
  url.searchParams.set("code", code);
  return NextResponse.json({ url: url.toString(), confirmation_code: code });
});

export const GET = handle(async (request: NextRequest) => {
  const status = readDeletionCode(request.nextUrl.searchParams.get("code"));
  if (!status) return fail(404, "not_found", "확인할 수 없는 삭제 요청 코드입니다.");
  return ok({ status: "completed", processedAt: new Date(status.at).toISOString() });
});
