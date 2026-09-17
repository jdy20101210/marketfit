import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { geocodeStores } from "@/lib/providers/map";
import { requireAdmin } from "@/lib/security/adminGuard";

export const maxDuration = 60;

const Body = z.object({ force: z.boolean().default(false) });

/** Kakao Local API로 점포 좌표 갱신 */
export const POST = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  const { force } = await readJson(request, Body);
  return ok(await geocodeStores({ force }));
});
