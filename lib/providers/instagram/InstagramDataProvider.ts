export interface InstagramInterest {
  keyword: string;
  score: number;
}

export interface InstagramInterestData {
  source: "instagram";
  mode: "real" | "mock";
  username: string | null;
  accountType: string | null;
  mediaAnalyzed: number;
  interests: InstagramInterest[];
  /** 실제 연동 시 Gemini 분석용 캡션 일부 (클라이언트로 내려보내지 않음) */
  captionsSample: string[];
  personaId: string | null;
  personaLabel: string | null;
  fetchedAt: string;
}

export interface GetProfileOptions {
  /** 데모 모드에서 사용할 페르소나 (없으면 무작위) */
  personaId?: string | null;
}

/**
 * Instagram 관심 신호 공급자.
 * - RealInstagramDataProvider: Instagram API with Instagram Login (공식 API만 사용)
 * - MockInstagramDataProvider: API 미설정/미연결 시 데모 데이터
 */
export interface InstagramDataProvider {
  readonly mode: "real" | "mock";
  getProfileData(userId: string, options?: GetProfileOptions): Promise<InstagramInterestData>;
}

export class InstagramNotConnectedError extends Error {
  constructor(message = "Instagram 계정이 연결되지 않았습니다.") {
    super(message);
  }
}
