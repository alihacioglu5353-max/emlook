import { AppShell } from "@/components/app-shell";

export default function PanelLayout({ children }: LayoutProps<"/panel">) {
  return <AppShell allow={["agent", "consumer"]}>{children}</AppShell>;
}
