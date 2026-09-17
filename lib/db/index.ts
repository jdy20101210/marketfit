import "server-only";
import { getEnv } from "@/lib/env";
import { getLocalDataDir } from "@/lib/runtime";
import { LocalRepository } from "./localRepository";
import { SupabaseRepository } from "./supabaseRepository";
import type { Repository, RepositoryInfo } from "./types";

export type { Repository } from "./types";

type Health = { lastError: string | null; lastErrorAt: string | null; lastOkAt: string | null };

/**
 * Supabase 호출이 실패해도 서비스가 멈추지 않도록 로컬/메모리 저장소로 대체합니다.
 * (예: 마이그레이션 SQL을 아직 실행하지 않은 경우)
 */
class ResilientRepository implements Repository {
  readonly health: Health = { lastError: null, lastErrorAt: null, lastOkAt: null };

  constructor(
    private readonly primary: Repository,
    private readonly fallback: Repository,
  ) {}

  info(): RepositoryInfo {
    const base = this.primary.info();
    return this.health.lastError
      ? { ...base, detail: `${base.detail} — 최근 오류로 일부 요청은 ${this.fallback.info().kind} 저장소를 사용: ${this.health.lastError}` }
      : base;
  }

  private async run<T>(name: string, fn: (r: Repository) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this.primary);
      this.health.lastOkAt = new Date().toISOString();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.health.lastError = message;
      this.health.lastErrorAt = new Date().toISOString();
      console.error(`[db] ${name} — Supabase 실패, 대체 저장소 사용:`, message);
      return fn(this.fallback);
    }
  }

  readSettings = () => this.run("readSettings", (r) => r.readSettings());
  writeSettings = (p: Parameters<Repository["writeSettings"]>[0]) => this.run("writeSettings", (r) => r.writeSettings(p));
  touchUser = (id: string) => this.run("touchUser", (r) => r.touchUser(id));
  savePreference = (p: Parameters<Repository["savePreference"]>[0]) => this.run("savePreference", (r) => r.savePreference(p));
  latestPreferences = (ids: string[]) => this.run("latestPreferences", (r) => r.latestPreferences(ids));
  addInteraction = (p: Parameters<Repository["addInteraction"]>[0]) => this.run("addInteraction", (r) => r.addInteraction(p));
  listInteractions = (id: string) => this.run("listInteractions", (r) => r.listInteractions(id));
  listPositiveInteractions = (n: number) => this.run("listPositiveInteractions", (r) => r.listPositiveInteractions(n));
  countInteractionsByStore = () => this.run("countInteractionsByStore", (r) => r.countInteractionsByStore());
  saveRecommendations = (id: string, recs: Parameters<Repository["saveRecommendations"]>[1]) =>
    this.run("saveRecommendations", (r) => r.saveRecommendations(id, recs));
  saveMerchantInsight = (p: Parameters<Repository["saveMerchantInsight"]>[0]) => this.run("saveMerchantInsight", (r) => r.saveMerchantInsight(p));
  latestMerchantInsight = (id: string | null) => this.run("latestMerchantInsight", (r) => r.latestMerchantInsight(id));
  upsertSocialConnection = (p: Parameters<Repository["upsertSocialConnection"]>[0]) =>
    this.run("upsertSocialConnection", (r) => r.upsertSocialConnection(p));
  getSocialConnection = (id: string, provider: "instagram") => this.run("getSocialConnection", (r) => r.getSocialConnection(id, provider));
  revokeSocialByExternalId = (provider: "instagram", ext: string) =>
    this.run("revokeSocialByExternalId", (r) => r.revokeSocialByExternalId(provider, ext));
  /**
   * 삭제는 두 저장소 모두에서 수행합니다(장애 중 대체 저장소에 기록된 데이터까지).
   * Supabase 삭제가 실패하면 성공으로 숨기지 않고 오류를 그대로 알려 다시 시도할 수 있게 합니다.
   */
  deleteUserData = async (id: string) => {
    await this.fallback.deleteUserData(id);
    await this.primary.deleteUserData(id);
  };
  loadStoreOverrides = () => this.run("loadStoreOverrides", (r) => r.loadStoreOverrides());
  saveStoreLocations = (l: Parameters<Repository["saveStoreLocations"]>[0]) => this.run("saveStoreLocations", (r) => r.saveStoreLocations(l));
  saveStoreDescriptions = (d: Parameters<Repository["saveStoreDescriptions"]>[0]) =>
    this.run("saveStoreDescriptions", (r) => r.saveStoreDescriptions(d));
  // seed는 실패를 숨기지 않고 그대로 알립니다.
  seedStores = (s: Parameters<Repository["seedStores"]>[0]) => this.primary.seedStores(s);
}

type RepoHolder = { repo: Repository; health: Health | null };
const globalForRepo = globalThis as unknown as { __marketfitRepo?: RepoHolder };

export function getRepository(): Repository {
  return getRepositoryHolder().repo;
}

export function getRepositoryHealth(): Health | null {
  return getRepositoryHolder().health;
}

function getRepositoryHolder(): RepoHolder {
  if (globalForRepo.__marketfitRepo) return globalForRepo.__marketfitRepo;
  const env = getEnv();
  const local = new LocalRepository(getLocalDataDir());
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  let holder: RepoHolder;
  if (url && env.SUPABASE_SERVICE_ROLE_KEY) {
    const resilient = new ResilientRepository(new SupabaseRepository(url, env.SUPABASE_SERVICE_ROLE_KEY), local);
    holder = { repo: resilient, health: resilient.health };
  } else {
    holder = { repo: local, health: null };
  }
  globalForRepo.__marketfitRepo = holder;
  return holder;
}

export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean((env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) && env.SUPABASE_SERVICE_ROLE_KEY);
}
