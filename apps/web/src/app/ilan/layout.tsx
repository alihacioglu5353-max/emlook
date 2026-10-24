import { AppShell } from "@/components/app-shell";

export default function ListingLayout({ children }: LayoutProps<"/ilan">) {
  return <AppShell>{children}</AppShell>;
}
