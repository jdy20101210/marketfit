import "server-only";
import { getInstagramConfig } from "@/lib/config/integrations";
import { MockInstagramDataProvider } from "./MockInstagramDataProvider";
import { RealInstagramDataProvider } from "./RealInstagramDataProvider";

export type { InstagramDataProvider, InstagramInterestData } from "./InstagramDataProvider";
export { MockInstagramDataProvider } from "./MockInstagramDataProvider";
export { RealInstagramDataProvider, toInterestData } from "./RealInstagramDataProvider";

/** 우선순위: Real(Meta 앱 설정 완료) → Mock */
export async function getInstagramProvider(): Promise<RealInstagramDataProvider | MockInstagramDataProvider> {
  const config = await getInstagramConfig();
  return config ? new RealInstagramDataProvider(config) : new MockInstagramDataProvider();
}
