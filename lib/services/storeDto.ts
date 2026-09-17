import "server-only";
import type { StoreDTO } from "@/lib/api/schemas";
import { storeDescriptionInput, templateStoreDescription } from "@/lib/stores/description";
import type { Store } from "@/lib/stores/types";

export function toStoreDTO(store: Store): StoreDTO {
  return {
    id: store.id,
    name: store.name,
    storeType: store.storeType,
    addressRaw: store.addressRaw,
    addressDetail: store.addressDetail,
    geocodeQuery: store.geocodeQuery,
    locationBasis: store.locationBasis,
    phone: store.phone,
    phoneRaw: store.phoneRaw,
    phoneStatus: store.phoneStatus,
    source: store.source,
    note: store.note,
    entityKind: store.entityKind,
    primaryCategory: store.features.primaryCategory,
    categories: store.features.categories,
    tags: store.features.tags,
    productHints: store.features.productHints,
    recommendable: store.features.recommendable,
    taste: store.features.taste,
    market: store.features.market,
    exposure: store.features.exposure,
    rationale: store.features.rationale,
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
