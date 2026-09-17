"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { Logo } from "@/components/layout/Logo";
import { api, errorMessage } from "@/lib/client/api";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/admin/login", { password });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-page max-w-md pt-12">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Logo className="h-7" />
          <span className="grid size-10 place-items-center rounded-2xl bg-market-700 text-white">
            <KeyRound className="size-5" aria-hidden />
          </span>
        </div>
        <h1 className="text-xl font-extrabold text-ink-900">관리자 로그인</h1>
        <p className="mt-1 text-sm text-ink-600">연동 설정과 점포 데이터를 관리하려면 관리자 비밀번호(ADMIN_PASSWORD)를 입력하세요.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm font-semibold text-ink-800" htmlFor="admin-password">
            비밀번호
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 w-full rounded-2xl border border-ink-200 bg-white px-4 outline-none focus:border-market-600 focus:ring-4 focus:ring-market-400/40"
          />
          {error ? <ErrorState message={error} /> : null}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            로그인
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function AdminLocked() {
  return (
    <div className="container-page max-w-xl pt-12">
      <Card className="p-6">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-sign-400 text-ink-900">
          <Lock className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-extrabold text-ink-900">관리자 기능이 잠겨 있어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          배포 환경에서는 보안을 위해 <code className="rounded bg-ink-100 px-1.5 py-0.5">ADMIN_PASSWORD</code> 환경변수가 필요해요. Vercel 대시보드 →
          Project → Settings → Environment Variables에 8자 이상의 비밀번호를 추가하고 다시 배포하세요.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">
          함께 <code className="rounded bg-ink-100 px-1.5 py-0.5">APP_SECRET</code>(32자 이상 임의 문자열)도 설정하면 세션·암호화 키가 안정적으로 유지돼요.
        </p>
      </Card>
    </div>
  );
}
