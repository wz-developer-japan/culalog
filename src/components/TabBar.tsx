"use client";

// 画面の下の4つのタブ（ホーム／予定／書類／聞く）と、まん中の「書類を渡す」ボタン。全部の画面に出す。
// はじめて開いたとき（家のデータが無い画面）は、ホームが body[data-start] を立てて隠す。

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "ホーム", match: (p: string) => p === "/" },
  { href: "/schedule", label: "予定", match: (p: string) => p.startsWith("/schedule") || p.startsWith("/rules") },
  { href: "/documents", label: "書類", match: (p: string) => p.startsWith("/documents") || p.startsWith("/inbox") || p.startsWith("/add") },
  { href: "/ask", label: "聞く", match: (p: string) => p.startsWith("/ask") || p.startsWith("/questions") },
];

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M4 11l8-6 8 6v8H4z" />,
  "/schedule": (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  "/documents": (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  "/ask": <path d="M5 5h14v10H9l-4 4z" />,
};

export function TabBar() {
  const pathname = usePathname() ?? "/";
  const giving = pathname.startsWith("/scan");
  return (
    <nav className="tabbar" aria-label="画面の切り替え">
      {TABS.map((t, i) => (
        <span key={t.href} style={{ display: "contents" }}>
          {i === 2 && (
            <Link className={`fab${giving ? " on" : ""}`} href="/scan" aria-label="書類を渡す">
              <svg className="l" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
          )}
          <Link className={`tab${!giving && t.match(pathname) ? " on" : ""}`} href={t.href}>
            <svg className="l" viewBox="0 0 24 24" aria-hidden>
              {ICONS[t.href]}
            </svg>
            {t.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
