import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { LogoMark } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <div className="container-page max-w-2xl pt-12">
      <EmptyState
        icon={<LogoMark className="size-8" />}
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 존재하지 않는 점포일 수 있어요."
        action={
          <>
            <LinkButton href="/">홈으로</LinkButton>
            <LinkButton href="/market-map" variant="secondary">
              시장 지도
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
