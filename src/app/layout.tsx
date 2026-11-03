import type { Metadata, Viewport } from "next";
import { AskRunner } from "@/components/AskRunner";
import { TabBar } from "@/components/TabBar";
import "./globals.css";
// 見た目 B「Bento Pop」。消すと globals.css のオレンジに戻る
import "./theme-b.css";
// パソコンの幅（1024px 以上）だけの並べ方
import "./pc.css";

export const metadata: Metadata = {
  title: "CULALOG（クラログ）",
  description: "家族の書類から、いつ・何を・どこで、を先回りして知らせる暮らしのログ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "クラログ" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // B「Bento Pop」はダークモードにも合わせる
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Zen+Maru+Gothic:wght@700&family=Noto+Sans+JP:wght@400;700&display=swap"
        />
      </head>
      <body>
        {children}
        <TabBar />
        <AskRunner />
      </body>
    </html>
  );
}
