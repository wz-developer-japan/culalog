import type { Metadata, Viewport } from "next";
import { TabBar } from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CULALOG（クラログ）",
  description: "家族の書類から、いつ・何を・どこで、を先回りして知らせる暮らしのログ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 背景は白で固定（ダークモードでも暗くしない）
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        {children}
        <TabBar />
      </body>
    </html>
  );
}
