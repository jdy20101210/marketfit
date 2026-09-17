import { z } from "zod";
import {
  INTEGRATION_KEYS,
  saveIntegrations,
  validateIntegrationValue,
  type IntegrationKey,
  type SettingsPatch,
} from "@/lib/config/integrations";
import { fail, getRequestOrigin, handle, ok, readJson } from "@/lib/http";
import { requireAdmin } from "@/lib/security/adminGuard";
import { getSystemStatus } from "@/lib/services/status";
import { invalidateStoreCache } from "@/lib/stores/catalog";

export const GET = handle(async (request: Request) => {
  await requireAdmin(request);
  return ok(await getSystemStatus(getRequestOrigin(request)));
});

const keyEnum = z.enum(INTEGRATION_KEYS as [IntegrationKey, ...IntegrationKey[]]);
const Body = z.object({
  values: z.record(z.string(), z.string().max(500)).default({}),
  clear: z.array(keyEnum).max(20).default([]),
});

/** 관리자 화면에서 입력한 연동 정보 저장 (서버에서 암호화, 응답에 값 미포함) */
export const PUT = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  const body = await readJson(request, Body);

  const patch: SettingsPatch = {};
  const fieldErrors: Partial<Record<IntegrationKey, string>> = {};
  for (const [rawKey, rawValue] of Object.entries(body.values)) {
    const parsedKey = keyEnum.safeParse(rawKey);
    if (!parsedKey.success) continue;
    const value = rawValue.trim();
    if (!value) continue;
    const error = validateIntegrationValue(parsedKey.data, value);
    if (error) fieldErrors[parsedKey.data] = error;
    else patch[parsedKey.data] = value;
  }
  if (Object.keys(fieldErrors).length) {
    return fail(422, "validation_error", "입력값을 확인해주세요.", { fieldErrors });
  }
  for (const key of body.clear) patch[key] = null;

  const result = await saveIntegrations(patch);
  invalidateStoreCache();
  return ok({ ...result, status: await getSystemStatus(getRequestOrigin(request)) });
});
