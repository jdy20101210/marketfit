import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-ink-200/70 bg-paper/80 pb-24 backdrop-blur-sm md:pb-8">
      <div className="container-page flex flex-col gap-4 py-8 text-sm text-ink-600 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo className="h-7" />
          <div className="mt-2">
            <p className="font-bold text-ink-800">AI가 발견하는 나만의 중앙시장</p>
            <p className="mt-1 max-w-md leading-relaxed">
              점포 정보는 대전중앙시장 공식 사이트 점포 목록을 정리한 433개 점포·상권 데이터를 사용합니다. 영업 여부와 연락처는 변동될 수 있으니 방문 전 확인해주세요.
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 font-medium">
          <li>
            <Link className="hover:text-ink-900" href="/privacy">
              개인정보 처리 안내
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink-900" href="/data-deletion">
              데이터 삭제
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink-900" href="/market-insight">
              시장 인사이트
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink-900" href="/merchant">
              상인 인사이트
            </Link>
          </li>
          <li>
            <Link className="hover:text-ink-900" href="/admin">
              관리자
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
