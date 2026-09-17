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
  savePreference = (p: Parameters<Repository["savePreference"]>[0], o?: Parameters<Repository["savePreference"]>[1]) =>
    this.run("savePreference", (r) => r.savePreference(p, o));
  activePreferences = (ids: string[]) => this.run("activePreferences", (r) => r.activePreferences(ids));
  listPreferenceHistory = (id: string, limit: number) => this.run("listPreferenceHistory", (r) => r.listPreferenceHistory(id, limit));
  activatePreference = (userId: string, id: string) => this.run("activatePreference", (r) => r.activatePreference(userId, id));
  updateActivePreferenceVector = (userId: string, v: Parameters<Repository["updateActivePreferenceVector"]>[1]) =>
    this.run("updateActivePreferenceVector", (r) => r.updateActivePreferenceVector(userId, v));
  listRecentPreferences = (since: string, limit: number) => this.run("listRecentPreferences", (r) => r.listRecentPreferences(since, limit));
  addInteraction = (p: Parameters<Repository["addInteraction"]>[0]) => this.run("addInteraction", (r) => r.addInteraction(p));
  listInteractions = (id: string) => this.run("listInteractions", (r) => r.listInteractions(id));
  listPositiveInteractions = (n: number, since?: string) => this.run("listPositiveInteractions", (r) => r.listPositiveInteractions(n, since));
  countInteractionsByStore = (since?: string) => this.run("countInteractionsByStore", (r) => r.countInteractionsByStore(since));
  saveRecommendations = (id: string, recs: Parameters<Repository["saveRecommendations"]>[1]) =>
    this.run("saveRecommendations", (r) => r.saveRecommendations(id, recs));
  saveMerchantInsight = (p: Parameters<Repository["saveMerchantInsight"]>[0]) => this.run("saveMerchantInsight", (r) => r.saveMerchantInsight(p));
  latestMerchantInsight = (id: string | null) => this.run("latestMerchantInsight", (r) => r.latestMerchantInsight(id));
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
  const url = getSupabaseUrl();
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

export function getSupabaseUrl(): string | undefined {
  const env = getEnv();
  return env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getEnv().SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAnonKey(): string | undefined {
  const env = getEnv();
  return env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * anon 키로 RLS가 제대로 막고 있는지 확인합니다 (관리자 점검 전용).
 * 공개 데이터(stores)는 읽히고, 개인 데이터(user_preferences)는 막혀야 정상입니다.
 */
export async function checkAnonAccess(): Promise<{ checked: boolean; storesReadable: boolean; personalBlocked: boolean; detail: string }> {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) return { checked: false, storesReadable: false, personalBlocked: false, detail: "SUPABASE_ANON_KEY가 없어 RLS 점검을 건너뜁니다." };
  const call = async (table: string) => {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return res.status;
  };
  try {
    const [stores, personal] = await Promise.all([call("stores"), call("user_preferences")]);
    const storesReadable = stores === 200;
    const personalBlocked = personal !== 200;
    return {
      checked: true,
      storesReadable,
      personalBlocked,
      detail: `anon 키 점검: 점포 조회 ${stores}${storesReadable ? " (읽기 허용, 정상)" : " (0003 마이그레이션 확인 필요)"} · 개인 데이터 조회 ${personal}${personalBlocked ? " (차단됨, 정상)" : " ⚠ 개인 데이터가 공개되어 있습니다"}`,
    };
  } catch (err) {
    return { checked: false, storesReadable: false, personalBlocked: false, detail: `anon 키 점검 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}
