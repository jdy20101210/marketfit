import { assertSameOrigin, handle, ok } from "@/lib/http";
import { endAdminSession } from "@/lib/security/session";

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  await endAdminSession();
  return ok({ loggedOut: true });
});
