/**
 * 엑셀 원본(djone_stores_438.xlsx)을 seed JSON으로 변환합니다.
 *
 * 원칙
 * - 엑셀에 있는 값만 옮깁니다. 점포명·주소·연락처·품목을 새로 만들거나 추측해서 채우지 않습니다.
 * - 원문(raw) 값은 그대로 보존하고, 나누고 정리한 값(items, phone, geocodeQuery 등)은 별도 필드로 둡니다.
 * - 이름·주소·품목·분류가 같고 전화번호가 같거나 한쪽이 '-'인 행은 같은 점포로 합칩니다(원본 sIdx는 모두 보존).
 *
 * 실행: npm run data:convert
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readExcelFile from "read-excel-file/node";
import { deriveEntityKind, parseAddress, parseCategories, parseItems, parsePhone, type LocLevel } from "../lib/stores/parse";
import type { StoreSeed } from "../lib/stores/types";

const SOURCE_FILE = "djone_stores_438.xlsx";
const SOURCE = path.join(process.cwd(), "data/stores/source", SOURCE_FILE);
const OUT = path.join(process.cwd(), "data/stores/stores.seed.json");
const SHEET = "Sheet1";
const EXPECTED_HEADER = ["sIdx", "name", "phone", "items", "categories", "address", "address_clean", "zone", "loc_level", "source", "collected"];
const LOC_LEVELS: LocLevel[] = ["building", "parcel", "zone", "market", "unknown"];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

async function main() {
  const sheets = await readExcelFile(readFileSync(SOURCE));
  const sheet = sheets.find((s) => s.sheet === SHEET) ?? sheets[0];
  if (!sheet) throw new Error("시트를 찾을 수 없습니다.");

  const [header, ...rows] = sheet.data;
  const headerText = header.map(cell);
  if (EXPECTED_HEADER.some((h, i) => headerText[i] !== h)) {
    throw new Error(`예상과 다른 컬럼 구성입니다: ${headerText.join(" | ")}`);
  }

  type Row = { sIdx: number; sourceRow: number; values: string[] };
  const parsed: Row[] = rows
    .map((row, index) => ({ sIdx: Number(cell(row[0])), sourceRow: index + 2, values: row.map(cell) }))
    .filter((r) => r.values[1] !== "");
  if (parsed.some((r) => !Number.isInteger(r.sIdx))) throw new Error("sIdx가 숫자가 아닌 행이 있습니다.");
  if (new Set(parsed.map((r) => r.sIdx)).size !== parsed.length) throw new Error("sIdx가 중복됩니다.");

  const stores: StoreSeed[] = [];
  const byKey = new Map<string, StoreSeed>();
  let merged = 0;

  for (const { sIdx, sourceRow, values } of parsed) {
    const [, name, phoneRaw, itemsRaw, categoriesRaw, addressRaw, addressClean, zone, locLevelRaw, source, collected] = values;
    const locLevel = (LOC_LEVELS.includes(locLevelRaw as LocLevel) ? locLevelRaw : "unknown") as LocLevel;
    const phone = parsePhone(phoneRaw!);
    const items = parseItems(itemsRaw!);
    const categories = parseCategories(categoriesRaw!);
    const address = parseAddress(addressRaw!, locLevel);

    const key = [name, addressRaw, itemsRaw, categoriesRaw].join("|");
    const existing = byKey.get(key);
    if (existing && (existing.phoneRaw === phoneRaw || existing.phoneStatus === "none" || phone.status === "none")) {
      existing.sourceIds.push(sIdx);
      if (existing.phoneStatus === "none" && phone.status !== "none") {
        existing.phoneRaw = phoneRaw!;
        existing.phone = phone.phone;
        existing.phoneStatus = phone.status;
      }
      existing.note = `원본에 같은 점포가 ${existing.sourceIds.length}행으로 등록되어 한 곳으로 합쳤습니다 (sIdx ${existing.sourceIds.join(", ")}).`;
      merged += 1;
      continue;
    }

    const store: StoreSeed = {
      id: `dj-${sIdx}`,
      sourceIds: [sIdx],
      name: name!,
      phoneRaw: phoneRaw!,
      phone: phone.phone,
      phoneStatus: phone.status,
      itemsRaw: itemsRaw!,
      items,
      storeType: items.join("·"),
      categoriesRaw: categoriesRaw!,
      mainCategory: categories.main,
      subCategory: categories.sub,
      addressRaw: addressRaw!,
      addressClean: addressClean || null,
      zone: zone || null,
      locLevel,
      source: source!,
      collectedAt: collected!,
      entityKind: deriveEntityKind({ name: name!, itemsRaw: itemsRaw!, detail: address.detail }),
      geocodeQuery: address.geocodeQuery,
      addressDetail: address.detail,
      locationBasis: address.basis,
      note: phone.status === "check" ? `원본 전화번호(${phoneRaw})가 일반적인 번호 형식과 달라 확인이 필요합니다.` : "",
      sourceRow,
    };
    byKey.set(key, store);
    stores.push(store);
  }

  // 원본 sIdx 순서(숫자)로 정렬
  stores.sort((a, b) => a.sourceIds[0]! - b.sourceIds[0]!);

  const payload = {
    meta: {
      sourceFile: SOURCE_FILE,
      sheet: sheet.sheet,
      source: "대전중앙시장 공식 사이트 점포 목록 (http://www.djone.kr/buy/buy.do)",
      rowCount: parsed.length,
      storeCount: stores.length,
      mergedRows: merged,
      collectedAt: parsed[0]?.values[10] ?? null,
      convertedAt: new Date().toISOString().slice(0, 10),
      notice:
        "엑셀 원본 값만 포함합니다. 영업 여부·세부 호수·연락처는 변동될 수 있으므로 방문 전 확인을 권장합니다. 좌표는 원본에 없어 Kakao Local API로만 채웁니다.",
    },
    stores,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`✓ 원본 ${parsed.length}행 → 점포 ${stores.length}곳 (같은 점포 ${merged}행 병합) → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
