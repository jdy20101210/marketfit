import { getPublicModes } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { handle, ok } from "@/lib/http";

export const GET = handle(async () => {
  const modes = await getPublicModes();
  return ok({ status: "ok", modes, storage: getRepository().info().kind, time: new Date().toISOString() });
});
