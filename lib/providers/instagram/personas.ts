/** 데모(Mock) 모드에서 사용하는 Instagram 관심사 페르소나 */
export interface MockPersona {
  id: string;
  label: string;
  emoji: string;
  description: string;
  interests: { keyword: string; score: number }[];
}

export const MOCK_PERSONAS: MockPersona[] = [
  {
    id: "camping",
    label: "캠핑/아웃도어형",
    emoji: "🏕️",
    description: "주말 캠핑과 커피, 감성 소품을 즐기는 타입",
    interests: [
      { keyword: "캠핑", score: 0.89 },
      { keyword: "커피", score: 0.84 },
      { keyword: "빈티지", score: 0.79 },
      { keyword: "여행", score: 0.76 },
      { keyword: "선물", score: 0.72 },
    ],
  },
  {
    id: "cafe",
    label: "카페/디저트형",
    emoji: "🍰",
    description: "디저트 투어와 카페 탐방이 일상인 타입",
    interests: [
      { keyword: "디저트", score: 0.91 },
      { keyword: "커피", score: 0.88 },
      { keyword: "베이커리", score: 0.74 },
      { keyword: "데이트", score: 0.69 },
      { keyword: "감성", score: 0.52 },
    ],
  },
  {
    id: "local",
    label: "전통/로컬형",
    emoji: "🏮",
    description: "노포와 시장 골목, 전통 문화를 찾아다니는 타입",
    interests: [
      { keyword: "전통시장", score: 0.9 },
      { keyword: "노포", score: 0.85 },
      { keyword: "국밥", score: 0.78 },
      { keyword: "한복", score: 0.66 },
      { keyword: "역사", score: 0.62 },
    ],
  },
  {
    id: "gift",
    label: "선물/쇼핑형",
    emoji: "🎁",
    description: "선물 고르기와 패션 잡화 쇼핑을 좋아하는 타입",
    interests: [
      { keyword: "선물", score: 0.92 },
      { keyword: "액세서리", score: 0.81 },
      { keyword: "가방", score: 0.77 },
      { keyword: "패션", score: 0.7 },
      { keyword: "기념일", score: 0.58 },
    ],
  },
  {
    id: "family",
    label: "가족/생활형",
    emoji: "👨‍👩‍👧",
    description: "가족 식탁과 살림을 꼼꼼히 챙기는 타입",
    interests: [
      { keyword: "가족", score: 0.9 },
      { keyword: "집밥", score: 0.83 },
      { keyword: "주방", score: 0.76 },
      { keyword: "살림", score: 0.72 },
      { keyword: "이불", score: 0.6 },
    ],
  },
  {
    id: "vintage",
    label: "빈티지/감성형",
    emoji: "🧵",
    description: "레트로 소품과 핸드메이드, 원단에 끌리는 타입",
    interests: [
      { keyword: "빈티지", score: 0.92 },
      { keyword: "레트로", score: 0.84 },
      { keyword: "원단", score: 0.72 },
      { keyword: "핸드메이드", score: 0.68 },
      { keyword: "인테리어", score: 0.63 },
    ],
  },
];

export function findPersona(id: string | null | undefined): MockPersona | undefined {
  return MOCK_PERSONAS.find((p) => p.id === id);
}
