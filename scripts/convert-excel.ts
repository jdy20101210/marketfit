/**
 * 엑셀 원본(대전중앙시장_점포및상권_40개_수정.xlsx)을 seed JSON으로 변환합니다.
 *
 * 원칙
 * - 엑셀에 있는 값만 옮깁니다. 점포명·주소·연락처를 새로 만들거나 추측해서 채우지 않습니다.
 * - 원문(raw) 값은 그대로 보존하고, 파싱한 값(phone, phoneStatus 등)은 별도 필드로 둡니다.
 *
 * 실행: npm run data:convert
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readExcelFile from "read-excel-file/node";
import { deriveEntityKind, parsePhone, parseAddress } from "../lib/stores/parse";

const SOURCE = path.join(process.cwd(), "data/stores/source/daejeon-jungang-market-stores-40.xlsx");
const OUT = path.join(process.cwd(), "data/stores/stores.seed.json");
const SHEET = "점포_상권_40개";
const EXPECTED_HEADER = ["점포명 또는 상권명", "점포 유형", "주소 또는 시장 내 위치", "전화번호/연락처", "확인 출처", "비고"];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

async function main() {
  const sheets = await readExcelFile(readFileSync(SOURCE));
  const sheet = sheets.find((s) => s.sheet === SHEET);
  if (!sheet) throw new Error(`시트 '${SHEET}'를 찾을 수 없습니다. 존재하는 시트: ${sheets.map((s) => s.sheet).join(", ")}`);

  const [header, ...rows] = sheet.data;
  const headerText = header.map(cell);
  if (EXPECTED_HEADER.some((h, i) => headerText[i] !== h)) {
    throw new Error(`예상과 다른 컬럼 구성입니다: ${headerText.join(" | ")}`);
  }

  const stores = rows
    .map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => cell(row[0]) !== "")
    .map(({ row, sourceRow }, i) => {
      const name = cell(row[0]);
      const storeType = cell(row[1]);
      const addressRaw = cell(row[2]);
      const phoneRaw = cell(row[3]);
      const source = cell(row[4]);
      const note = cell(row[5]);
      const phone = parsePhone(phoneRaw);
      const address = parseAddress(addressRaw);
      return {
        id: `jm-${String(i + 1).padStart(3, "0")}`,
        name,
        storeType,
        addressRaw,
        phoneRaw,
        phone: phone.phone,
        phoneStatus: phone.status,
        source,
        note,
        entityKind: deriveEntityKind({ name, storeType, source, note }),
        geocodeQuery: address.geocodeQuery,
        addressDetail: address.detail,
        locationBasis: address.basis,
        sourceRow,
      };
    });

  const names = new Set<string>();
  for (const s of stores) {
    if (names.has(s.name)) throw new Error(`중복 점포명: ${s.name}`);
    names.add(s.name);
  }

  const payload = {
    meta: {
      sourceFile: "대전중앙시장_점포및상권_40개_수정.xlsx",
      sheet: SHEET,
      rowCount: stores.length,
      convertedAt: new Date().toISOString().slice(0, 10),
      notice:
        "엑셀 원본 값만 포함합니다. 영업 여부·세부 호수·연락처는 변동될 수 있으므로 공식 제출 전 전화 또는 현장 확인을 권장합니다(원본 '수집기준_주의사항' 시트).",
    },
    stores,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`✓ ${stores.length}개 점포/상권을 ${path.relative(process.cwd(), OUT)}에 저장했습니다.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
