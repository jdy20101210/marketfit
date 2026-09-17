import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminLocked, AdminLogin } from "@/components/admin/AdminGate";
import { IntegrationsClient } from "@/components/admin/IntegrationsClient";
import { getAdminMode, isAdmin } from "@/lib/security/session";
import { getServerOrigin } from "@/lib/serverOrigin";
import { getSystemStatus } from "@/lib/services/status";

export const metadata: Metadata = { title: "연동 설정", robots: { index: false, follow: false } };

export default async function IntegrationsPage() {
  await connection();
  const mode = getAdminMode();
  if (mode === "locked") return <AdminLocked />;
  if (!(await isAdmin())) return <AdminLogin />;
  const origin = await getServerOrigin();
  const status = await getSystemStatus(origin);
  return <IntegrationsClient initialStatus={status} origin={origin} />;
}
