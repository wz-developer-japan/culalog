// 書類の分類6語のアイコン（黒の線だけ。分類にはパステルの色を使わない）

import type { Group } from "@/lib/labels";

const PATHS: Record<Group, React.ReactNode> = {
  暮らし: (
    <>
      <path d="M4 11l8-6.5 8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  お金: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 7.5 12 12l3.5-4.5M12 12v5M9 12.5h6M9 15h6" />
    </>
  ),
  子どもと学校: (
    <>
      <path d="M7 9a5 5 0 0 1 10 0v11H7z" />
      <path d="M7 13h10M10 13v2.5h4V13" />
    </>
  ),
  けがと病院: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  契約: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </>
  ),
  手続き: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 3h6v4H9zM9 12l2 2 4-4" />
    </>
  ),
};

export function GroupIcon({ group, size = 22 }: { group: Group; size?: number }) {
  return (
    <svg className="gicon" viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[group]}
    </svg>
  );
}

/** トップの入口のアイコン（黒の線だけ） */
export function MenuIcon({ kind }: { kind: "schedule" | "documents" | "numbers" | "cases" }) {
  const paths = {
    schedule: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h2M12 14h2M8 17h2" />
      </>
    ),
    documents: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h6" />
      </>
    ),
    numbers: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    cases: (
      <>
        <path d="M12 3v18" />
        <path d="M5 6h11l3 3-3 3H5zM19 13H8l-3 3 3 3h11z" />
      </>
    ),
  }[kind];
  return (
    <svg className="micon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}
