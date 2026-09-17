import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLocked, AdminLogin } from "@/components/admin/AdminGate";
import { getAdminMode, isAdmin } from "@/lib/security/session";
import { getServerOrigin } from "@/lib/serverOrigin";
import { getSystemStatus } from "@/lib/services/status";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStores } from "@/lib/stores/catalog";

export const metadata: Metadata = { title: "관리자", robots: { index: false, follow: false } };

export default async function AdminPage() {
  await connection();
  const mode = getAdminMode();
  if (mode === "locked") return <AdminLocked />;
  if (!(await isAdmin())) return <AdminLogin />;
  const [status, stores] = await Promise.all([getSystemStatus(await getServerOrigin()), getStores()]);
  return <AdminDashboard status={status} stores={stores.map(toStoreDTO)} devOpen={mode === "dev-open"} />;
}
