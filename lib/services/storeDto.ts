import "server-only";
import type { StoreDTO } from "@/lib/api/schemas";
import { storeDescriptionInput, templateStoreDescription } from "@/lib/stores/description";
import type { Store } from "@/lib/stores/types";

export function toStoreDTO(store: Store): StoreDTO {
  return {
    id: store.id,
    name: store.name,
    storeType: store.storeType,
    raw: {
      sourceIds: store.sourceIds,
      items: store.items,
      itemsRaw: store.itemsRaw,
      categoriesRaw: store.categoriesRaw,
      addressRaw: store.addressRaw,
      addressClean: store.addressClean,
      zone: store.zone,
      locLevel: store.locLevel,
      phoneRaw: store.phoneRaw,
      source: store.source,
      collectedAt: store.collectedAt,
    },
    mainCategory: store.mainCategory,
    subCategory: store.subCategory,
    addressDetail: store.addressDetail,
    geocodeQuery: store.geocodeQuery,
    locationBasis: store.locationBasis,
    phone: store.phone,
    phoneStatus: store.phoneStatus,
    note: store.note,
    entityKind: store.entityKind,
    inferred: {
      by: store.features.inferredBy,
      taste: store.features.taste,
      market: store.features.market,
      exposure: store.features.exposure,
      rationale: store.features.rationale,
    },
    primaryCategory: store.features.primaryCategory,
    categories: store.features.categories,
    tags: store.features.tags,
    productHints: store.features.productHints,
    recommendable: store.features.recommendable,
    activity: {
      visitCount: store.activity.visitCount,
      likeCount: store.activity.likeCount,
      saveCount: store.activity.saveCount,
      interestUsers: store.activity.interestUsers,
    },
    description: store.description
      ? { text: store.description.text, provider: store.description.provider, updatedAt: store.description.updatedAt }
      : { text: templateStoreDescription(storeDescriptionInput(store)), provider: "template", updatedAt: null },
    location: {
      lat: store.location.lat,
      lng: store.location.lng,
      accuracy: store.location.accuracy,
      note: store.location.note,
    },
  };
}
