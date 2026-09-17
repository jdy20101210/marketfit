import type { GetProfileOptions, InstagramDataProvider, InstagramInterestData } from "./InstagramDataProvider";
import { findPersona, MOCK_PERSONAS } from "./personas";

export class MockInstagramDataProvider implements InstagramDataProvider {
  readonly mode = "mock" as const;

  async getProfileData(_userId: string, options: GetProfileOptions = {}): Promise<InstagramInterestData> {
    const persona = findPersona(options.personaId) ?? MOCK_PERSONAS[Math.floor(Math.random() * MOCK_PERSONAS.length)]!;
    return {
      source: "instagram",
      mode: "mock",
      username: null,
      accountType: null,
      mediaAnalyzed: 0,
      interests: persona.interests.map((i) => ({ ...i })),
      captionsSample: [],
      personaId: persona.id,
      personaLabel: persona.label,
      fetchedAt: new Date().toISOString(),
    };
  }
}
