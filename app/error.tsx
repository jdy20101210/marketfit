"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page max-w-2xl pt-12">
      <ErrorState
        title="페이지를 표시하지 못했어요"
        message="일시적인 문제일 수 있어요. 다시 시도하거나 홈으로 이동해주세요."
        action={
          <>
            <Button size="sm" onClick={reset}>
              다시 시도
            </Button>
            <LinkButton href="/" size="sm" variant="secondary">
              홈으로
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
