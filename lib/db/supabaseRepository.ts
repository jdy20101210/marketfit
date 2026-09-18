import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toVector, type TasteVector } from "@/lib/recommendation/dimensions";
import type { InputMode } from "@/lib/preferences/types";
import type { MarketFeatures, Store, StoreCategory, StoreDescription, StoreFeatures, StoreLocation, StoreSeed } from "@/lib/stores/types";
import type {
  InteractionCounts,
  InteractionRecord,
  InteractionType,
  MerchantInsightRecord,
  NewPreferenceRecord,
  PreferenceContextRecord,
  PreferenceRecord,
  RecentPreferenceSignal,
  RecommendationRecord,
  Repository,
  RepositoryInfo,
  StoreOverrides,
} from "./types";

type Row = Record<string, unknown>;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`[supabase] ${what} 실패: ${result.error.message}`);
  return result.data;
}

const EMPTY_CONTEXT: PreferenceContextRecord = {
  intent: null,
  intentLabel: null,
  budget: null,
  companion: null,
  occasion: null,
  preferredStyle: [],
  discoveryPreference: null,
};

const INPUT_MODES: InputMode[] = ["chat", "keywords", "both"];

function mapPreference(r: Row): PreferenceRecord {
  return {
    id: String(r.analysis_id ?? r.id),
    userId: String(r.user_id),
    analysisVersion: Number(r.analysis_version ?? 1),
    inputMode: INPUT_MODES.includes(r.input_mode as InputMode) ? (r.input_mode as InputMode) : "keywords",
    tasteVector: toVector(r.taste_vector as Record<string, unknown>),
    recentVector: toVector(r.recent_vector as Record<string, unknown>),
    topCategories: (r.top_categories as PreferenceRecord["topCategories"]) ?? [],
    keywords: (r.keywords as string[]) ?? [],
    context: { ...EMPTY_CONTEXT, ...((r.context as Partial<PreferenceContextRecord> | null) ?? {}) },
    personaLabel: (r.persona_label as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    aiProvider: "builtin",
    aiModel: (r.ai_model as string | null) ?? null,
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at),
  };
}

const PREFERENCE_COLUMNS =
  "analysis_id, user_id, analysis_version, input_mode, taste_vector, recent_vector, top_categories, keywords, context, persona_label, summary, ai_provider, ai_model, is_active, created_at";

/**
 * Supabase PostgreSQL 저장소 (service_role 키, 서버 전용)
 * 스키마: supabase/migrations/0001 → 0002 → 0003 순서로 적용
 */
export class SupabaseRepository implements Repository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-client-info": "marketfit-server" } },
    });
  }

  info(): RepositoryInfo {
    return { kind: "supabase", persistent: true, detail: "Supabase PostgreSQL (service role, 서버 전용)" };
  }

  async readSettings() {
    const rows = must(await this.db.from("app_settings").select("key, value_encrypted"), "설정 조회") as Row[];
    return Object.fromEntries(rows.map((r) => [String(r.key), String(r.value_encrypted)]));
  }

  async writeSettings(patch: Record<string, string | null>) {
    const upserts = Object.entries(patch)
      .filter(([, v]) => v !== null)
      .map(([key, value]) => ({ key, value_encrypted: value, updated_at: new Date().toISOString() }));
    const deletes = Object.entries(patch)
      .filter(([, v]) => v === null)
      .map(([key]) => key);
    if (upserts.length) must(await this.db.from("app_settings").upsert(upserts), "설정 저장");
    if (deletes.length) must(await this.db.from("app_settings").delete().in("key", deletes), "설정 삭제");
  }

  async touchUser(userId: string) {
    must(
      await this.db.from("users").upsert({ id: userId, last_seen_at: new Date().toISOString() }, { onConflict: "id" }),
      "사용자 기록",
    );
  }

  // ---------- 취향 분석 결과 (버전 관리) ----------

  async savePreference(r: NewPreferenceRecord, options: { minVersion?: number } = {}) {
    await this.touchUser(r.userId);
    const latest = must(
      await this.db.from("user_preferences").select("analysis_version").eq("user_id", r.userId).order("analysis_version", { ascending: false }).limit(1),
      "분석 버전 조회 (supabase/migrations/0003 적용 필요)",
    ) as Row[];
    const maxVersion = Number(latest[0]?.analysis_version ?? 0);
    const analysisVersion = Math.max(maxVersion, (options.minVersion ?? 1) - 1) + 1;
    must(await this.db.from("user_preferences").update({ is_active: false }).eq("user_id", r.userId).eq("is_active", true), "이전 분석 비활성화");
    must(
      await this.db.from("user_preferences").insert({
        analysis_id: r.id,
        user_id: r.userId,
        analysis_version: analysisVersion,
        input_mode: r.inputMode,
        taste_vector: r.tasteVector,
        recent_vector: r.recentVector,
        top_categories: r.topCategories,
        keywords: r.keywords,
        context: r.context,
        persona_label: r.personaLabel,
        summary: r.summary,
        ai_provider: r.aiProvider,
        ai_model: r.aiModel,
        is_active: true,
        created_at: r.createdAt,
      }),
      "취향 저장",
    );
    return { analysisVersion };
  }

  async activePreferences(userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = must(
      await this.db
        .from("user_preferences")
        .select(PREFERENCE_COLUMNS)
        .in("user_id", userIds.slice(0, 1000))
        .order("is_active", { ascending: false })
        .order("analysis_version", { ascending: false })
        .limit(5000),
      "취향 조회",
    ) as Row[];
    const byUser = new Map<string, PreferenceRecord>();
    for (const r of rows) {
      const userId = String(r.user_id);
      if (!byUser.has(userId)) byUser.set(userId, mapPreference(r));
    }
    return [...byUser.values()];
  }

  async listPreferenceHistory(userId: string, limit: number) {
    const rows = must(
      await this.db.from("user_preferences").select(PREFERENCE_COLUMNS).eq("user_id", userId).order("analysis_version", { ascending: false }).limit(limit),
      "분석 기록 조회",
    ) as Row[];
    return rows.map(mapPreference);
  }

  async activatePreference(userId: string, id: string) {
    const found = must(
      await this.db.from("user_preferences").select("analysis_id").eq("user_id", userId).eq("analysis_id", id).limit(1),
      "분석 결과 확인",
    ) as Row[];
    if (found.length === 0) return false;
    must(await this.db.from("user_preferences").update({ is_active: false }).eq("user_id", userId).eq("is_active", true), "이전 분석 비활성화");
    must(await this.db.from("user_preferences").update({ is_active: true }).eq("user_id", userId).eq("analysis_id", id), "분석 결과 활성화");
    return true;
  }

  async updateActivePreferenceVector(userId: string, tasteVector: TasteVector) {
    must(
      await this.db.from("user_preferences").update({ taste_vector: tasteVector }).eq("user_id", userId).eq("is_active", true),
      "취향 업데이트",
    );
  }

  async listRecentPreferences(sinceIso: string, limit: number): Promise<RecentPreferenceSignal[]> {
    const rows = must(
      await this.db
        .from("user_preferences")
        .select("user_id, taste_vector, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit),
      "최근 취향 집계 조회",
    ) as Row[];
    return rows.map((r) => ({ userKey: String(r.user_id), tasteVector: toVector(r.taste_vector as Record<string, unknown>), createdAt: String(r.created_at) }));
  }

  // ---------- 행동 기록 ----------

  async addInteraction(r: InteractionRecord) {
    await this.touchUser(r.userId);
    must(
      await this.db.from("user_interactions").insert({
        user_id: r.userId,
        store_id: r.storeId,
        interaction_type: r.type,
        active: r.active,
        created_at: r.createdAt,
      }),
      "행동 기록",
    );
  }

  private mapInteraction(r: Row): InteractionRecord {
    return {
      userId: String(r.user_id),
      storeId: String(r.store_id),
      type: r.interaction_type as InteractionType,
      active: Boolean(r.active),
      createdAt: String(r.created_at),
    };
  }

  async listInteractions(userId: string) {
    const rows = must(
      await this.db
        .from("user_interactions")
        .select("user_id, store_id, interaction_type, active, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(2000),
      "행동 조회",
    ) as Row[];
    return rows.map((r) => this.mapInteraction(r));
  }

  async listPositiveInteractions(limit: number, sinceIso?: string) {
    let query = this.db
      .from("user_interactions")
      .select("user_id, store_id, interaction_type, active, created_at")
      .in("interaction_type", ["like", "bookmark", "visit"])
      .eq("active", true);
    if (sinceIso) query = query.gte("created_at", sinceIso);
    const rows = must(await query.order("created_at", { ascending: false }).limit(limit), "집계용 행동 조회") as Row[];
    return rows.map((r) => this.mapInteraction(r));
  }

  async countInteractionsByStore(sinceIso?: string) {
    let query = this.db.from("user_interactions").select("store_id, interaction_type").eq("active", true);
    if (sinceIso) query = query.gte("created_at", sinceIso);
    const rows = must(await query.order("created_at", { ascending: false }).limit(20000), "행동 집계") as Row[];
    const out: InteractionCounts = {};
    for (const r of rows) {
      const bucket = (out[String(r.store_id)] ??= {});
      const type = r.interaction_type as InteractionType;
      bucket[type] = (bucket[type] ?? 0) + 1;
    }
    return out;
  }

  async saveRecommendations(userId: string, records: RecommendationRecord[]) {
    if (records.length === 0) return;
    await this.touchUser(userId);
    must(
      await this.db.from("recommendations").insert(
        records.map((r) => ({
          user_id: userId,
          store_id: r.storeId,
          score: r.score,
          rank: r.rank,
          components: r.components,
          reason: r.reason,
          reason_provider: r.reasonProvider,
          analysis_version: r.analysisVersion,
          created_at: r.createdAt,
        })),
      ),
      "추천 저장",
    );
  }

  async saveMerchantInsight(r: MerchantInsightRecord) {
    must(
      await this.db.from("merchant_insights").insert({
        store_id: r.storeId,
        period_start: r.periodStart,
        period_end: r.periodEnd,
        distinct_users: r.distinctUsers,
        taste_distribution: r.tasteDistribution,
        interaction_counts: r.interactionCounts,
        product_ideas: r.productIdeas,
        is_mock: r.isMock,
        created_at: r.createdAt,
      }),
      "상인 인사이트 저장",
    );
  }

  async latestMerchantInsight(storeId: string | null) {
    const base = this.db.from("merchant_insights").select("*").order("created_at", { ascending: false }).limit(1);
    const rows = must(await (storeId ? base.eq("store_id", storeId) : base.is("store_id", null)), "상인 인사이트 조회") as Row[];
    const r = rows[0];
    if (!r) return null;
    return {
      storeId: (r.store_id as string | null) ?? null,
      periodStart: (r.period_start as string | null) ?? null,
      periodEnd: (r.period_end as string | null) ?? null,
      distinctUsers: Number(r.distinct_users ?? 0),
      tasteDistribution: (r.taste_distribution as MerchantInsightRecord["tasteDistribution"]) ?? [],
      interactionCounts: (r.interaction_counts as MerchantInsightRecord["interactionCounts"]) ?? {},
      productIdeas: (r.product_ideas as string[]) ?? [],
      isMock: Boolean(r.is_mock),
      createdAt: String(r.created_at),
    } satisfies MerchantInsightRecord;
  }

  async deleteUserData(userId: string) {
    // users 삭제 시 on delete cascade로 취향·행동·추천 기록이 함께 삭제됩니다.
    must(await this.db.from("users").delete().eq("id", userId), "사용자 데이터 삭제");
  }

  // ---------- 점포 ----------

  async loadStoreOverrides(): Promise<StoreOverrides> {
    const storeRows = must(await this.db.from("stores").select("*").order("id"), "점포 조회") as Row[];
    if (storeRows.length === 0) return { stores: null, features: null, locations: [], descriptions: [] };
    const featureRows = must(await this.db.from("store_features").select("*"), "점포 feature 조회") as Row[];

    const stores: StoreSeed[] = storeRows.map((r) => ({
      id: String(r.id),
      sourceIds: ((r.source_ids as number[] | null) ?? []).map(Number),
      name: String(r.name),
      phoneRaw: String(r.phone_raw ?? ""),
      phone: (r.phone as string | null) ?? null,
      phoneStatus: r.phone_status as StoreSeed["phoneStatus"],
      itemsRaw: String(r.items_raw ?? ""),
      items: (r.items as string[] | null) ?? [],
      storeType: String(r.store_type ?? ""),
      categoriesRaw: String(r.categories_raw ?? ""),
      mainCategory: String(r.main_category ?? ""),
      subCategory: String(r.sub_category ?? ""),
      addressRaw: String(r.address_raw ?? ""),
      addressClean: (r.address_clean as string | null) ?? null,
      zone: (r.zone as string | null) ?? null,
      locLevel: (r.loc_level as StoreSeed["locLevel"]) ?? "unknown",
      source: String(r.source ?? ""),
      collectedAt: String(r.collected_at ?? ""),
      entityKind: r.entity_kind as StoreSeed["entityKind"],
      geocodeQuery: (r.geocode_query as string | null) ?? null,
      addressDetail: (r.address_detail as string | null) ?? null,
      locationBasis: (r.location_basis as StoreSeed["locationBasis"]) ?? "none",
      note: String(r.note ?? ""),
      sourceRow: Number(r.source_row ?? 0),
    }));
    const features: StoreFeatures[] = featureRows.map((r) => ({
      storeId: String(r.store_id),
      primaryCategory: r.primary_category as StoreCategory,
      categories: (r.categories as StoreCategory[]) ?? [],
      subCategory: String(r.sub_category ?? ""),
      taste: toVector(r.taste as Record<string, unknown>),
      // 이전 버전 seed에는 없는 키가 있을 수 있어 catalog에서 기본값과 합칩니다.
      market: (r.market ?? {}) as MarketFeatures,
      exposure: Number(r.exposure ?? 0.5),
      tags: (r.tags as string[]) ?? [],
      productHints: (r.product_hints as string[]) ?? [],
      recommendable: Boolean(r.recommendable),
      rationale: String(r.rationale ?? ""),
      inferredBy: "rule",
    }));
    // 좌표가 있거나, 조회는 했지만 주소를 찾지 못한(geocoded_at 기록) 결과를 돌려줍니다.
    const locations: StoreLocation[] = storeRows
      .filter((r) => (r.lat !== null && r.lng !== null) || r.geocoded_at !== null)
      .map((r) => ({
        storeId: String(r.id),
        lat: r.lat === null ? null : Number(r.lat),
        lng: r.lng === null ? null : Number(r.lng),
        accuracy: r.lat === null ? "unknown" : (r.location_accuracy as StoreLocation["accuracy"]),
        note: String(r.location_note ?? ""),
        query: (r.geocode_query as string | null) ?? null,
        provider: (r.location_provider as StoreLocation["provider"]) ?? null,
        geocodedAt: (r.geocoded_at as string | null) ?? null,
      }));
    const descriptions: StoreDescription[] = featureRows
      .filter((r) => typeof r.description === "string" && r.description.length > 0)
      .map((r) => ({
        storeId: String(r.store_id),
        text: String(r.description),
        provider: "template",
        model: (r.description_model as string | null) ?? null,
        updatedAt: String(r.description_updated_at ?? r.updated_at ?? ""),
      }));
    return { stores, features: features.length ? features : null, locations, descriptions };
  }

  async saveStoreDescriptions(descriptions: StoreDescription[]) {
    for (const d of descriptions) {
      const updated = must(
        await this.db
          .from("store_features")
          .update({
            description: d.text,
            description_provider: d.provider,
            description_model: d.model,
            description_updated_at: d.updatedAt,
          })
          .eq("store_id", d.storeId)
          .select("store_id"),
        "점포 소개 저장 (supabase/migrations/0002 적용 필요)",
      ) as Row[];
      if (updated.length === 0) {
        throw new Error(`[supabase] 점포 소개 저장 실패: store_features에 ${d.storeId}가 없습니다. 먼저 seed를 실행하세요.`);
      }
    }
  }

  async saveStoreLocations(locations: StoreLocation[]) {
    for (const loc of locations) {
      const updated = must(
        await this.db
          .from("stores")
          .update({
            lat: loc.lat,
            lng: loc.lng,
            location_accuracy: loc.accuracy,
            location_note: loc.note,
            location_provider: loc.provider,
            geocoded_at: loc.geocodedAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", loc.storeId)
          .select("id"),
        "좌표 저장",
      ) as Row[];
      if (updated.length === 0) {
        // stores 테이블이 비어 있으면 update가 조용히 0행에 적용됩니다 → 명확한 오류로 알립니다.
        throw new Error(`[supabase] 좌표 저장 실패: stores 테이블에 ${loc.storeId}가 없습니다. 먼저 npm run seed(또는 관리자 화면의 seed)를 실행하세요.`);
      }
    }
  }

  /** 점포·feature를 반영하고, 현재 원본에 없는 이전 점포 행은 삭제합니다. */
  async seedStores(stores: Store[]) {
    const now = new Date().toISOString();
    for (let i = 0; i < stores.length; i += 200) {
      const chunk = stores.slice(i, i + 200);
      must(
        await this.db.from("stores").upsert(
          chunk.map((s) => ({
            id: s.id,
            source_ids: s.sourceIds,
            name: s.name,
            store_type: s.storeType,
            items: s.items,
            items_raw: s.itemsRaw,
            categories_raw: s.categoriesRaw,
            main_category: s.mainCategory,
            sub_category: s.subCategory,
            address_raw: s.addressRaw,
            address_clean: s.addressClean,
            zone: s.zone,
            loc_level: s.locLevel,
            phone_raw: s.phoneRaw,
            phone: s.phone,
            phone_status: s.phoneStatus,
            source: s.source,
            collected_at: s.collectedAt || null,
            note: s.note,
            entity_kind: s.entityKind,
            geocode_query: s.geocodeQuery,
            address_detail: s.addressDetail,
            location_basis: s.locationBasis,
            source_row: s.sourceRow,
            lat: s.location.lat,
            lng: s.location.lng,
            location_accuracy: s.location.accuracy,
            location_note: s.location.note,
            location_provider: s.location.provider,
            geocoded_at: s.location.geocodedAt,
            updated_at: now,
          })),
          { onConflict: "id" },
        ),
        "점포 seed (supabase/migrations/0003 적용 필요)",
      );
      must(
        await this.db.from("store_features").upsert(
          chunk.map((s) => ({
            store_id: s.id,
            primary_category: s.features.primaryCategory,
            categories: s.features.categories,
            sub_category: s.features.subCategory,
            inferred_by: s.features.inferredBy,
            taste: s.features.taste,
            market: s.features.market,
            exposure: s.features.exposure,
            tags: s.features.tags,
            product_hints: s.features.productHints,
            recommendable: s.features.recommendable,
            rationale: s.features.rationale,
            updated_at: now,
          })),
          { onConflict: "store_id" },
        ),
        "점포 feature seed",
      );
    }
    const keep = new Set(stores.map((s) => s.id));
    const existing = must(await this.db.from("stores").select("id").limit(10000), "기존 점포 조회") as Row[];
    const stale = existing.map((r) => String(r.id)).filter((id) => !keep.has(id));
    for (let i = 0; i < stale.length; i += 100) {
      must(await this.db.from("stores").delete().in("id", stale.slice(i, i + 100)), "이전 점포 정리");
    }
    return { stores: stores.length, features: stores.length, removed: stale.length };
  }
}
