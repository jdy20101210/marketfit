import "server-only";
import type { InstagramConfig } from "@/lib/config/integrations";
import { INSTAGRAM_SCOPES } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import type { InstagramSignals } from "@/lib/db/types";
import { decryptString, encryptString } from "@/lib/security/crypto";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  fetchRecentMedia,
  InstagramApiError,
  refreshLongLivedToken,
} from "./instagramApi";
import { InstagramNotConnectedError, type InstagramDataProvider, type InstagramInterestData } from "./InstagramDataProvider";
import { extractInterests, sampleCaptions } from "./keywordExtractor";

const TOKEN_PURPOSE = "instagram-token";
const REFRESH_WHEN_DAYS_LEFT = 10;

export interface AuthorizationResult {
  externalUserId: string | null;
  signals: InstagramSignals;
  tokenStored: boolean;
  permissions: string[];
}

export class RealInstagramDataProvider implements InstagramDataProvider {
  readonly mode = "real" as const;

  constructor(private readonly config: InstagramConfig) {}

  authorizeUrl(redirectUri: string, state: string): string {
    return buildAuthorizeUrl({ appId: this.config.appId, redirectUri, state, scopes: INSTAGRAM_SCOPES });
  }

  /** OAuth 콜백: code 교환 → 장기 토큰 → 프로필/캡션 조회 → 관심 신호 추출 → (DB가 영구 저장소면) 토큰 암호화 저장 */
  async completeAuthorization(userId: string, code: string, redirectUri: string): Promise<AuthorizationResult> {
    const shortLived = await exchangeCodeForToken({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      redirectUri,
      code,
    });

    let accessToken = shortLived.accessToken;
    let expiresAt: string | null = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    try {
      const longLived = await exchangeForLongLivedToken({ appSecret: this.config.appSecret, accessToken });
      accessToken = longLived.accessToken;
      expiresAt = longLived.expiresIn ? new Date(Date.now() + longLived.expiresIn * 1000).toISOString() : null;
    } catch (err) {
      // 장기 토큰 교환이 실패해도 이번 분석은 단기 토큰으로 계속 진행합니다.
      console.warn("[instagram] 장기 토큰 교환 실패:", err instanceof Error ? err.message : err);
    }

    const signals = await this.collectSignals(accessToken);
    const repo = getRepository();
    const persistent = repo.info().persistent;
    const externalUserId = shortLived.userId ?? null;

    await repo.upsertSocialConnection({
      userId,
      provider: "instagram",
      status: "connected",
      externalUserId,
      username: signals.username,
      accountType: signals.accountType,
      signals,
      // 영구 저장소(Supabase/로컬 파일)일 때만 토큰을 암호화해 보관합니다. 메모리 모드에서는 저장하지 않습니다.
      tokenEncrypted: persistent ? encryptString(accessToken, TOKEN_PURPOSE) : null,
      tokenExpiresAt: persistent ? expiresAt : null,
      updatedAt: new Date().toISOString(),
    });

    return { externalUserId, signals, tokenStored: persistent, permissions: shortLived.permissions };
  }

  /** 저장된 토큰으로 관심 신호를 다시 수집합니다. 토큰이 없으면 연결 시점의 스냅샷을 사용합니다. */
  async getProfileData(userId: string): Promise<InstagramInterestData> {
    const repo = getRepository();
    const connection = await repo.getSocialConnection(userId, "instagram");
    if (!connection || connection.status !== "connected") throw new InstagramNotConnectedError();

    let signals = connection.signals;
    const token = connection.tokenEncrypted ? decryptString(connection.tokenEncrypted, TOKEN_PURPOSE) : null;
    if (token) {
      // 만료가 가까우면 먼저 갱신하고, 갱신된 토큰은 아래의 단일 upsert에 함께 저장합니다(이전 값으로 덮어쓰지 않도록).
      const refreshed = await this.maybeRefresh(token, connection.tokenExpiresAt);
      const tokenFields = refreshed
        ? { tokenEncrypted: encryptString(refreshed.accessToken, TOKEN_PURPOSE), tokenExpiresAt: refreshed.expiresAt }
        : { tokenEncrypted: connection.tokenEncrypted, tokenExpiresAt: connection.tokenExpiresAt };
      try {
        signals = await this.collectSignals(refreshed?.accessToken ?? token);
        await repo.upsertSocialConnection({
          ...connection,
          ...tokenFields,
          signals,
          username: signals.username,
          accountType: signals.accountType,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof InstagramApiError && err.isAuthError) {
          await repo.upsertSocialConnection({ ...connection, status: "error", tokenEncrypted: null, tokenExpiresAt: null, updatedAt: new Date().toISOString() });
          throw new InstagramNotConnectedError("Instagram 인증이 만료되었습니다. 다시 연결해주세요.");
        }
        if (refreshed) {
          // 데이터 조회는 실패했어도 갱신된 토큰은 보관합니다.
          await repo.upsertSocialConnection({ ...connection, ...tokenFields, updatedAt: new Date().toISOString() });
        }
        console.warn("[instagram] 최신 데이터 조회 실패, 저장된 스냅샷 사용:", err instanceof Error ? err.message : err);
      }
    }
    if (!signals) throw new InstagramNotConnectedError();
    return toInterestData(signals);
  }

  /** 장기 토큰 만료 10일 이내면 갱신합니다. 실패하거나 갱신이 필요 없으면 null (저장은 호출한 쪽에서) */
  private async maybeRefresh(token: string, expiresAt: string | null): Promise<{ accessToken: string; expiresAt: string | null } | null> {
    if (!expiresAt) return null;
    const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
    if (daysLeft > REFRESH_WHEN_DAYS_LEFT || daysLeft < 0) return null;
    try {
      const refreshed = await refreshLongLivedToken(token);
      return {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : null,
      };
    } catch (err) {
      console.warn("[instagram] 토큰 갱신 실패:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async collectSignals(accessToken: string): Promise<InstagramSignals> {
    const version = this.config.graphVersion;
    const profile = await fetchProfile({ accessToken, version });
    // TODO(Meta 검수): 개발 모드에서는 앱 역할이 있는 테스터 계정만 media 조회가 가능합니다.
    const media = await fetchRecentMedia({ accessToken, version, limit: 30 });
    const withCaption = media.filter((m) => m.caption);
    return {
      username: profile.username,
      accountType: profile.accountType,
      mediaAnalyzed: media.length,
      interests: extractInterests(withCaption),
      captionsSample: sampleCaptions(withCaption),
      fetchedAt: new Date().toISOString(),
    };
  }
}

export function toInterestData(signals: InstagramSignals): InstagramInterestData {
  return {
    source: "instagram",
    mode: "real",
    username: signals.username,
    accountType: signals.accountType,
    mediaAnalyzed: signals.mediaAnalyzed,
    interests: signals.interests,
    captionsSample: signals.captionsSample,
    personaId: null,
    personaLabel: null,
    fetchedAt: signals.fetchedAt,
  };
}
