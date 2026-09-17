import { getInstagramConfig } from "@/lib/config/integrations";
import { handle, ok } from "@/lib/http";
import { currentInstagramSnapshot } from "@/lib/services/instagramSession";

export const GET = handle(async () => {
  const [config, snapshot] = await Promise.all([getInstagramConfig(), currentInstagramSnapshot()]);
  const connected = Boolean(config && snapshot);
  return ok({
    mode: config ? "real" : "mock",
    connected,
    username: connected ? snapshot!.username : null,
    accountType: connected ? snapshot!.accountType : null,
    mediaAnalyzed: connected ? snapshot!.mediaAnalyzed : 0,
    interests: connected ? snapshot!.interests.slice(0, 8) : [],
    fetchedAt: connected ? snapshot!.fetchedAt : null,
  });
});
