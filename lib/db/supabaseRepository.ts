import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toVector } from "@/lib/recommendation/dimensions";
import type { MarketFeatures, Store, StoreCategory, StoreDescription, StoreFeatures, StoreLocation, StoreSeed } from "@/lib/stores/types";
import type {
  InteractionRecord,
  InteractionType,
  MerchantInsightRecord,
  PreferenceRecord,
  RecommendationRecord,
  Repository,
  RepositoryInfo,
  SocialConnectionRecord,
  StoreOverrides,
} from "./types";

type Row = Record<string, unknown>;

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`[supabase] ${what} 실패: ${result.error.message}`);
  return result.data;
}

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

  async savePreference(r: PreferenceRecord) {
    await this.touchUser(r.userId);
    must(
      await this.db.from("user_preferences").insert({
        user_id: r.userId,
        taste_vector: r.tasteVector,
        recent_vector: r.recentVector,
        top_categories: r.topCategories,
        interest_inputs: r.interestInputs,
        instagram_keywords: r.instagramKeywords,
        instagram_mode: r.instagramMode,
        persona_label: r.personaLabel,
        summary: r.summary,
        ai_provider: r.aiProvider,
        created_at: r.createdAt,
      }),
      "취향 저장",
    );
  }

  async latestPreferences(userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = must(
      await this.db
        .from("user_preferences")
        .select("*")
        .in("user_id", userIds.slice(0, 1000))
        .order("created_at", { ascending: false })
        .limit(5000),
      "취향 조회",
    ) as Row[];
    const latest = new Map<string, PreferenceRecord>();
    for (const r of rows) {
      const userId = String(r.user_id);
      if (latest.has(userId)) continue;
      latest.set(userId, {
        userId,
        tasteVector: toVector(r.taste_vector as Record<string, unknown>),
        recentVector: toVector(r.recent_vector as Record<string, unknown>),
        topCategories: (r.top_categories as PreferenceRecord["topCategories"]) ?? [],
        interestInputs: (r.interest_inputs as string[]) ?? [],
        instagramKeywords: (r.instagram_keywords as PreferenceRecord["instagramKeywords"]) ?? [],
        instagramMode: (r.instagram_mode as PreferenceRecord["instagramMode"]) ?? "none",
        personaLabel: (r.persona_label as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
        aiProvider: r.ai_provider === "gemini" ? "gemini" : "mock",
        createdAt: String(r.created_at),
      });
    }
    return [...latest.values()];
  }

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

  async listPositiveInteractions(limit: number) {
    const rows = must(
      await this.db
        .from("user_interactions")
        .select("user_id, store_id, interaction_type, active, created_at")
        .in("interaction_type", ["like", "bookmark", "visit"])
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(limit),
      "집계용 행동 조회",
    ) as Row[];
    return rows.map((r) => this.mapInteraction(r));
  }

  async countInteractionsByStore() {
    const rows = must(
      await this.db
        .from("user_interactions")
        .select("store_id, interaction_type")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(20000),
      "행동 집계",
    ) as Row[];
    const out: Record<string, Partial<Record<InteractionType, number>>> = {};
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

  async upsertSocialConnection(r: SocialConnectionRecord) {
    await this.touchUser(r.userId);
    const row = must(
      await this.db
        .from("social_connections")
        .upsert(
          {
            user_id: r.userId,
            provider: r.provider,
            status: r.status,
            external_user_id: r.externalUserId,
            username: r.username,
            account_type: r.accountType,
            signals: r.signals,
            updated_at: r.updatedAt,
          },
          { onConflict: "user_id,provider" },
        )
        .select("id")
        .single(),
      "연결 저장",
    ) as Row;
    const connectionId = Number(row.id);
    if (r.tokenEncrypted) {
      must(
        await this.db.from("social_tokens").upsert({
          connection_id: connectionId,
          access_token_encrypted: r.tokenEncrypted,
          expires_at: r.tokenExpiresAt,
          updated_at: new Date().toISOString(),
        }),
        "토큰 저장",
      );
    } else {
      must(await this.db.from("social_tokens").delete().eq("connection_id", connectionId), "토큰 삭제");
    }
  }

  async getSocialConnection(userId: string, provider: "instagram") {
    const row = must(
      await this.db
        .from("social_connections")
        .select("*, social_tokens(access_token_encrypted, expires_at)")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle(),
      "연결 조회",
    ) as Row | null;
    if (!row) return null;
    const tokenRel = row.social_tokens as Row | Row[] | null;
    const token = Array.isArray(tokenRel) ? tokenRel[0] : tokenRel;
    return {
      userId,
      provider,
      status: row.status as SocialConnectionRecord["status"],
      externalUserId: (row.external_user_id as string | null) ?? null,
      username: (row.username as string | null) ?? null,
      accountType: (row.account_type as string | null) ?? null,
      signals: (row.signals as SocialConnectionRecord["signals"]) ?? null,
      tokenEncrypted: (token?.access_token_encrypted as string | undefined) ?? null,
      tokenExpiresAt: (token?.expires_at as string | undefined) ?? null,
      updatedAt: String(row.updated_at),
    };
  }

  async revokeSocialByExternalId(provider: "instagram", externalUserId: string) {
    const rows = must(
      await this.db
        .from("social_connections")
        .update({ status: "revoked", signals: null, updated_at: new Date().toISOString() })
        .eq("provider", provider)
        .eq("external_user_id", externalUserId)
        .select("id, user_id"),
      "연결 해제",
    ) as Row[];
    if (rows.length) {
      must(
        await this.db
          .from("social_tokens")
          .delete()
          .in(
            "connection_id",
            rows.map((r) => Number(r.id)),
          ),
        "토큰 삭제",
      );
    }
    return rows.map((r) => String(r.user_id));
  }

  async deleteUserData(userId: string) {
    // users 삭제 시 on delete cascade로 관련 데이터가 함께 삭제됩니다.
    must(await this.db.from("users").delete().eq("id", userId), "사용자 데이터 삭제");
  }

  async loadStoreOverrides(): Promise<StoreOverrides> {
    const storeRows = must(await this.db.from("stores").select("*").order("id"), "점포 조회") as Row[];
    if (storeRows.length === 0) return { stores: null, features: null, locations: [], descriptions: [] };
    const featureRows = must(await this.db.from("store_features").select("*"), "점포 feature 조회") as Row[];

    const stores: StoreSeed[] = storeRows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      storeType: String(r.store_type),
      addressRaw: String(r.address_raw ?? ""),
      phoneRaw: String(r.phone_raw ?? ""),
      phone: (r.phone as string | null) ?? null,
      phoneStatus: r.phone_status as StoreSeed["phoneStatus"],
      source: String(r.source ?? ""),
      note: String(r.note ?? ""),
      entityKind: r.entity_kind as StoreSeed["entityKind"],
      geocodeQuery: (r.geocode_query as string | null) ?? null,
      addressDetail: (r.address_detail as string | null) ?? null,
      locationBasis: (r.location_basis as StoreSeed["locationBasis"]) ?? "none",
      sourceRow: Number(r.source_row ?? 0),
    }));
    const features: StoreFeatures[] = featureRows.map((r) => ({
      storeId: String(r.store_id),
      primaryCategory: r.primary_category as StoreCategory,
      categories: (r.categories as StoreCategory[]) ?? [],
      taste: toVector(r.taste as Record<string, unknown>),
      // 이전 버전 seed에는 없는 키가 있을 수 있어 catalog에서 기본값과 합칩니다.
      market: (r.market ?? {}) as MarketFeatures,
      exposure: Number(r.exposure ?? 0.5),
      tags: (r.tags as string[]) ?? [],
      productHints: (r.product_hints as string[]) ?? [],
      recommendable: Boolean(r.recommendable),
      rationale: String(r.rationale ?? ""),
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
    // 0002 마이그레이션의 소개 컬럼 (적용 전이면 값이 없음)
    const descriptions: StoreDescription[] = featureRows
      .filter((r) => typeof r.description === "string" && r.description.length > 0)
      .map((r) => ({
        storeId: String(r.store_id),
        text: String(r.description),
        provider: r.description_provider === "gemini" ? "gemini" : "template",
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

  async seedStores(stores: Store[]) {
    const now = new Date().toISOString();
    must(
      await this.db.from("stores").upsert(
        stores.map((s) => ({
          id: s.id,
          name: s.name,
          store_type: s.storeType,
          address_raw: s.addressRaw,
          phone_raw: s.phoneRaw,
          phone: s.phone,
          phone_status: s.phoneStatus,
          source: s.source,
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
      "점포 seed",
    );
    must(
      await this.db.from("store_features").upsert(
        stores.map((s) => ({
          store_id: s.id,
          primary_category: s.features.primaryCategory,
          categories: s.features.categories,
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
    return { stores: stores.length, features: stores.length };
  }
}
