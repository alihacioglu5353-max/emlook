import type { Metadata } from "next";
// Font kendi sunucumuzdan sunulur (Google'a istek gitmez).
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Emlook", template: "%s · Emlook" },
  description:
    "Emlakçıların portföy paylaştığı, eşleştiği ve komisyonunu online tahsil ettiği sosyal ağ.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
