import { AppShell } from "@/components/app-shell";

/** Tüm rollerin gördüğü sosyal alan: akış, ilan, danışman profili, kaydedilenler */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
