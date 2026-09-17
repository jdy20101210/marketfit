/**
 * 서버·브라우저에서 같은 결과를 내는 표시 형식 (hydration 불일치 방지)
 * Node와 브라우저의 ICU 로캘 데이터가 달라 toLocaleString 결과가 어긋날 수 있어 직접 계산합니다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 "9월 18일 오전 08:30" */
export function formatKstDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET_MS);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h24 = d.getUTCHours();
  const meridiem = h24 < 12 ? "오전" : "오후";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 ${meridiem} ${hour}:${minute}`;
}

/** 1234567 → "1,234,567" (로캘 데이터에 의존하지 않음) */
export function formatNumber(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
