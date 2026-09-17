import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TasteVector } from "@/lib/recommendation/dimensions";
import type { Store, StoreDescription, StoreLocation } from "@/lib/stores/types";
import type {
  InteractionCounts,
  InteractionRecord,
  MerchantInsightRecord,
  NewPreferenceRecord,
  PreferenceRecord,
  RecentPreferenceSignal,
  RecommendationRecord,
  Repository,
  RepositoryInfo,
  StoreOverrides,
} from "./types";

interface LocalData {
  version: 2;
  settings: Record<string, string>;
  users: Record<string, { createdAt: string; lastSeenAt: string }>;
  preferences: PreferenceRecord[];
  interactions: InteractionRecord[];
  recommendations: Record<string, RecommendationRecord[]>;
  locations: StoreLocation[];
  descriptions: StoreDescription[];
  merchantInsights: MerchantInsightRecord[];
}

const LIMITS = { preferences: 5000, interactions: 50000, merchantInsights: 500 };

function emptyData(): LocalData {
  return {
    version: 2,
    settings: {},
    users: {},
    preferences: [],
    interactions: [],
    recommendations: {},
    locations: [],
    descriptions: [],
    merchantInsights: [],
  };
}

/** v1 파일(Instagram 연결 정보·버전 없는 취향 기록)을 v2 구조로 옮깁니다. 연결·토큰 정보는 버립니다. */
function migrate(parsed: Record<string, unknown>): LocalData {
  const base = { ...emptyData(), ...(parsed as Partial<LocalData>), version: 2 as const };
  delete (base as Record<string, unknown>).social;
  if (parsed.version !== 2) {
    const counters = new Map<string, number>();
    base.preferences = ((parsed.preferences as Record<string, unknown>[] | undefined) ?? []).map((p, i) => {
      const userId = String(p.userId);
      const version = (counters.get(userId) ?? 0) + 1;
      counters.set(userId, version);
      return {
        id: `legacy-${i}`,
        userId,
        analysisVersion: version,
        inputMode: "keywords",
        tasteVector: p.tasteVector as TasteVector,
        recentVector: (p.recentVector ?? p.tasteVector) as TasteVector,
        topCategories: (p.topCategories as PreferenceRecord["topCategories"]) ?? [],
        keywords: (p.interestInputs as string[]) ?? [],
        context: { intent: null, intentLabel: null, budget: null, companion: null, occasion: null, preferredStyle: [], discoveryPreference: null },
        personaLabel: (p.personaLabel as string | null) ?? null,
        summary: (p.summary as string | null) ?? null,
        aiProvider: p.aiProvider === "gemini" ? "gemini" : "mock",
        aiModel: null,
        isActive: false,
        createdAt: String(p.createdAt ?? new Date(0).toISOString()),
      } satisfies PreferenceRecord;
    });
    const latest = new Map<string, PreferenceRecord>();
    for (const p of base.preferences) latest.set(p.userId, p);
    for (const p of latest.values()) p.isActive = true;
  }
  return base;
}

/**
 * 개발/자체 서버용 JSON 파일 저장소. dir이 null이면 메모리에만 보관합니다(서버리스 데모용).
 * Supabase를 연결하면 이 저장소 대신 SupabaseRepository가 사용됩니다.
 */
export class LocalRepository implements Repository {
  private data: LocalData;
  private readonly file: string | null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dir: string | null) {
    this.file = dir ? path.join(dir, "marketfit-local.json") : null;
    this.data = this.load();
  }

  info(): RepositoryInfo {
    return this.file
      ? { kind: "local-file", persistent: true, detail: "로컬 JSON 파일(.data) — 개발/자체 서버용" }
      : {
          kind: "memory",
          persistent: false,
          detail: "서버 메모리 — 서버리스 환경에서는 인스턴스가 바뀌면 초기화됩니다. Supabase 연결을 권장합니다.",
        };
  }

  private load(): LocalData {
    if (!this.file || !existsSync(this.file)) return emptyData();
    try {
      return migrate(JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>);
    } catch (err) {
      console.warn("[db] 로컬 데이터 파일을 읽지 못해 새로 시작합니다:", err);
      return emptyData();
    }
  }

  private persist(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    this.writeChain = this.writeChain.then(() => {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
        renameSync(tmp, file);
      } catch (err) {
        console.error("[db] 로컬 데이터 저장 실패:", err);
      }
    });
    return this.writeChain;
  }

  async readSettings() {
    return { ...this.data.settings };
  }

  async writeSettings(patch: Record<string, string | null>) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete this.data.settings[key];
      else this.data.settings[key] = value;
    }
    await this.persist();
  }

  private markUser(userId: string) {
    const now = new Date().toISOString();
    const existing = this.data.users[userId];
    this.data.users[userId] = { createdAt: existing?.createdAt ?? now, lastSeenAt: now };
  }

  async touchUser(userId: string) {
    this.markUser(userId);
    await this.persist();
  }

  async savePreference(record: NewPreferenceRecord, options: { minVersion?: number } = {}) {
    this.markUser(record.userId);
    const mine = this.data.preferences.filter((p) => p.userId === record.userId);
    const maxVersion = mine.reduce((m, p) => Math.max(m, p.analysisVersion), 0);
    const analysisVersion = Math.max(maxVersion, (options.minVersion ?? 1) - 1) + 1;
    for (const p of mine) p.isActive = false;
    this.data.preferences.push({ ...record, analysisVersion, isActive: true });
    if (this.data.preferences.length > LIMITS.preferences) this.data.preferences.splice(0, this.data.preferences.length - LIMITS.preferences);
    await this.persist();
    return { analysisVersion };
  }

  async activePreferences(userIds: string[]) {
    const wanted = new Set(userIds);
    const latest = new Map<string, PreferenceRecord>();
    const active = new Map<string, PreferenceRecord>();
    for (const p of this.data.preferences) {
      if (!wanted.has(p.userId)) continue;
      latest.set(p.userId, p);
      if (p.isActive) active.set(p.userId, p);
    }
    return [...latest.keys()].map((id) => active.get(id) ?? latest.get(id)!);
  }

  async listPreferenceHistory(userId: string, limit: number) {
    return this.data.preferences
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.analysisVersion - a.analysisVersion)
      .slice(0, limit);
  }

  async activatePreference(userId: string, id: string) {
    const target = this.data.preferences.find((p) => p.userId === userId && p.id === id);
    if (!target) return false;
    for (const p of this.data.preferences) if (p.userId === userId) p.isActive = p === target;
    await this.persist();
    return true;
  }

  async updateActivePreferenceVector(userId: string, tasteVector: TasteVector) {
    const [active] = await this.activePreferences([userId]);
    if (!active) return;
    active.tasteVector = tasteVector;
    await this.persist();
  }

  async listRecentPreferences(sinceIso: string, limit: number): Promise<RecentPreferenceSignal[]> {
    return this.data.preferences
      .filter((p) => p.createdAt >= sinceIso)
      .slice(-limit)
      .map((p) => ({ userKey: p.userId, tasteVector: p.tasteVector, createdAt: p.createdAt }));
  }

  async addInteraction(record: InteractionRecord) {
    this.markUser(record.userId);
    this.data.interactions.push(record);
    if (this.data.interactions.length > LIMITS.interactions) this.data.interactions.splice(0, this.data.interactions.length - LIMITS.interactions);
    await this.persist();
  }

  async listInteractions(userId: string) {
    return this.data.interactions.filter((i) => i.userId === userId);
  }

  async listPositiveInteractions(limit: number, sinceIso?: string) {
    return this.data.interactions
      .filter((i) => i.active && ["like", "bookmark", "visit"].includes(i.type) && (!sinceIso || i.createdAt >= sinceIso))
      .slice(-limit);
  }

  async countInteractionsByStore(sinceIso?: string) {
    const out: InteractionCounts = {};
    for (const i of this.data.interactions) {
      if (!i.active || (sinceIso && i.createdAt < sinceIso)) continue;
      const bucket = (out[i.storeId] ??= {});
      bucket[i.type] = (bucket[i.type] ?? 0) + 1;
    }
    return out;
  }

  async saveRecommendations(userId: string, records: RecommendationRecord[]) {
    this.markUser(userId);
    this.data.recommendations[userId] = records;
    await this.persist();
  }

  async saveMerchantInsight(record: MerchantInsightRecord) {
    this.data.merchantInsights.push(record);
    if (this.data.merchantInsights.length > LIMITS.merchantInsights) {
      this.data.merchantInsights.splice(0, this.data.merchantInsights.length - LIMITS.merchantInsights);
    }
    await this.persist();
  }

  async latestMerchantInsight(storeId: string | null) {
    for (let i = this.data.merchantInsights.length - 1; i >= 0; i--) {
      const r = this.data.merchantInsights[i]!;
      if (r.storeId === storeId) return r;
    }
    return null;
  }

  async deleteUserData(userId: string) {
    delete this.data.users[userId];
    this.data.preferences = this.data.preferences.filter((p) => p.userId !== userId);
    this.data.interactions = this.data.interactions.filter((i) => i.userId !== userId);
    delete this.data.recommendations[userId];
    await this.persist();
  }

  async loadStoreOverrides(): Promise<StoreOverrides> {
    return { stores: null, features: null, locations: [...this.data.locations], descriptions: [...this.data.descriptions] };
  }

  async saveStoreLocations(locations: StoreLocation[]) {
    const map = new Map(this.data.locations.map((l) => [l.storeId, l]));
    for (const loc of locations) map.set(loc.storeId, loc);
    this.data.locations = [...map.values()];
    await this.persist();
  }

  async saveStoreDescriptions(descriptions: StoreDescription[]) {
    const map = new Map(this.data.descriptions.map((d) => [d.storeId, d]));
    for (const d of descriptions) map.set(d.storeId, d);
    this.data.descriptions = [...map.values()];
    await this.persist();
  }

  async seedStores(stores: Store[]) {
    // 로컬 모드에서는 data/stores/*.json이 곧 seed 데이터입니다.
    return { stores: stores.length, features: stores.length, removed: 0 };
  }
}
