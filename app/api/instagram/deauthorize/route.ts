import { handle, ok } from "@/lib/http";
import { handleDeauthorize, readSignedRequest } from "@/lib/services/metaCallbacks";

/** Meta 앱 설정의 "Deauthorize callback URL" */
export const POST = handle(async (request: Request) => {
  const externalUserId = await readSignedRequest(request);
  await handleDeauthorize(externalUserId);
  return ok({ received: true });
});
