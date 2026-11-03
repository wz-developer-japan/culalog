// 画面の小さな挿絵。線を使わず丸い形を塗るだけ・1つの絵に色は3つまで（オレンジ・紺・黄が軸）。
// 書類の種類ごとの絵（ホームの締切カード・いちばん近い締切）と、空っぽのときの執事の絵。

import type { DocumentCategory } from "@/lib/types";

const C = {
  orange: "#e8662a",
  orangeLight: "#f59a52",
  navy: "#3d4a6b",
  yellow: "#f6c247",
  yellowDark: "#d99a1e",
  red: "#e2574c",
  redDark: "#c8443a",
  blue: "#5b8ee6",
  green: "#5fb37d",
  skin: "#f6d2b8",
  paper: "#fffaf3",
  white: "#ffffff",
  line: "#eee8e3",
  lineWarm: "#eadfd6",
  greenLight: "#cfe6d7",
  navyLight: "#56668f",
  shadow: "#000000",
  hair: "#5a463c",
  ink: "#2b2420",
  cheek: "#f3a98e",
  lineDark: "#d6cbbf",
};

export type PicKind = DocumentCategory | "missing" | "money";
export type MenuKind = "schedule" | "documents" | "family" | "numbers" | "ask" | "rules" | "cases";

/** トップのメニューの挿絵（40×40） */
export function MenuPic({ kind, size = 40 }: { kind: MenuKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", "aria-hidden": true as const };
  switch (kind) {
    case "schedule":
      return (
        <svg {...common}>
          <rect x="6" y="9" width="28" height="25" rx="5" fill={C.white} stroke={C.line} strokeWidth="1" />
          <path d="M6 14a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v3H6z" fill={C.orange} />
          <rect x="12" y="5" width="3" height="7" rx="1.5" fill={C.navy} />
          <rect x="25" y="5" width="3" height="7" rx="1.5" fill={C.navy} />
          <rect x="11" y="21" width="5" height="4" rx="1" fill={C.yellow} />
          <rect x="18" y="21" width="5" height="4" rx="1" fill={C.lineWarm} />
          <rect x="25" y="21" width="5" height="4" rx="1" fill={C.lineWarm} />
          <rect x="11" y="27" width="5" height="4" rx="1" fill={C.lineWarm} />
          <rect x="18" y="27" width="5" height="4" rx="1" fill={C.red} />
        </svg>
      );
    case "documents":
      return (
        <svg {...common}>
          <rect x="8" y="7" width="18" height="22" rx="2" fill={C.white} transform="rotate(-8 17 18)" />
          <rect x="14" y="6" width="18" height="22" rx="2" fill={C.paper} stroke={C.lineWarm} transform="rotate(6 23 17)" />
          <path d="M5 19h30l-3 15H8z" fill={C.orangeLight} />
          <path d="M5 19h30v4H5z" fill={C.orange} />
        </svg>
      );
    case "family":
      return (
        <svg {...common}>
          <circle cx="13" cy="13" r="5" fill={C.blue} />
          <path d="M5 30c0-6 4-9 8-9s8 3 8 9z" fill={C.blue} />
          <circle cx="27" cy="13" r="5" fill={C.orange} />
          <path d="M19 30c0-6 4-9 8-9s8 3 8 9z" fill={C.orange} />
          <circle cx="20" cy="22" r="4" fill={C.yellow} />
          <path d="M13.5 35c0-5 3-7 6.5-7s6.5 2 6.5 7z" fill={C.yellow} />
        </svg>
      );
    case "numbers":
      return (
        <svg {...common}>
          <rect x="9" y="17" width="22" height="17" rx="4" fill={C.navy} />
          <path d="M14 17v-4a6 6 0 0 1 12 0v4" fill="none" stroke={C.navy} strokeWidth="3" />
          <circle cx="20" cy="24" r="2.5" fill={C.yellow} />
          <rect x="19" y="25" width="2" height="4" rx="1" fill={C.yellow} />
        </svg>
      );
    case "ask":
      return (
        <svg {...common}>
          <path d="M6 10a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H16l-7 6v-6a4 4 0 0 1-3-4z" fill={C.orange} />
          <circle cx="14" cy="16.5" r="2" fill={C.white} />
          <circle cx="20" cy="16.5" r="2" fill={C.white} />
          <circle cx="26" cy="16.5" r="2" fill={C.white} />
        </svg>
      );
    case "rules":
      return (
        <svg {...common}>
          <rect x="9" y="5" width="22" height="30" rx="3" fill={C.green} />
          <rect x="12" y="8" width="16" height="24" rx="1.5" fill={C.white} />
          <path d="M15 14h10M15 19h10M15 24h6" stroke={C.greenLight} strokeWidth="2" strokeLinecap="round" />
          <path d="M25 5v10l2.5-2 2.5 2V5" fill={C.red} />
        </svg>
      );
    case "cases":
      // 道しるべ（こんなとき、どこを見ればいいか）
      return (
        <svg {...common}>
          <rect x="18.5" y="5" width="3" height="31" rx="1.5" fill={C.navy} />
          <path d="M8 9h21l5 5-5 5H8z" fill={C.orange} />
          <path d="M32 21H11l-5 5 5 5h21z" fill={C.yellow} />
        </svg>
      );
  }
}

/** 種類ごとの挿絵（40×40） */
export function Pic({ kind, size = 34 }: { kind: PicKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", "aria-hidden": true as const };
  switch (kind) {
    case "school":
      return (
        <svg {...common}>
          <rect x="8" y="9" width="24" height="26" rx="7" fill={C.red} />
          <path d="M8 18c0-6 5-9 12-9s12 3 12 9v3H8z" fill={C.redDark} />
          <rect x="17" y="20" width="6" height="5" rx="1.5" fill={C.yellow} />
          <path d="M14 9c0-4 3-6 6-6s6 2 6 6" fill="none" stroke={C.redDark} strokeWidth="2.5" />
        </svg>
      );
    case "childcare":
      return (
        <svg {...common}>
          <circle cx="20" cy="24" r="12" fill={C.yellow} />
          <circle cx="24" cy="14" r="8" fill={C.yellow} />
          <circle cx="27" cy="13" r="1.6" fill={C.navy} />
          <path d="M31 15l5 1.5-5 1.5z" fill={C.orange} />
          <ellipse cx="14" cy="36" rx="4" ry="1.5" fill={C.orange} />
          <ellipse cx="24" cy="36" rx="4" ry="1.5" fill={C.orange} />
        </svg>
      );
    case "housing":
      return (
        <svg {...common}>
          <path d="M6 19L20 7l14 12v15H6z" fill={C.orangeLight} />
          <path d="M3 20L20 5l17 15" fill="none" stroke={C.orange} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="16" y="23" width="8" height="11" rx="2" fill={C.navy} />
          <rect x="24" y="18" width="5" height="5" rx="1" fill={C.yellow} />
        </svg>
      );
    case "insurance":
      return (
        <svg {...common}>
          <path d="M20 5l12 4v9c0 8-5 13-12 16-7-3-12-8-12-16V9z" fill={C.navy} />
          <path d="M20 9l8 2.7V18c0 5.5-3.3 9.5-8 11.8V9z" fill={C.navyLight} />
          <path d="M14 20l4 4 8-8" fill="none" stroke={C.yellow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "vehicle":
      return (
        <svg {...common}>
          <path d="M6 24l4-9c.6-1.4 2-2 3.4-2h13.2c1.4 0 2.8.6 3.4 2l4 9v7H6z" fill={C.blue} />
          <path d="M11 22l3-6h12l3 6z" fill={C.paper} />
          <circle cx="12" cy="31" r="4" fill={C.navy} />
          <circle cx="28" cy="31" r="4" fill={C.navy} />
          <rect x="6" y="24" width="4" height="3" rx="1" fill={C.yellow} />
          <rect x="30" y="24" width="4" height="3" rx="1" fill={C.yellow} />
        </svg>
      );
    case "medical_card":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="30" height="21" rx="4" fill={C.navy} />
          <rect x="5" y="15" width="30" height="4" fill={C.yellow} />
          <rect x="9" y="23" width="12" height="3" rx="1.5" fill={C.white} />
          <circle cx="29" cy="25" r="3" fill={C.orange} />
        </svg>
      );
    case "care":
      return (
        <svg {...common}>
          <path d="M6 24c0-3 2-5 5-5h8l4 3v8H11c-3 0-5-2-5-5z" fill={C.skin} />
          <path d="M34 24c0-3-2-5-5-5h-8l-4 3v8h12c3 0 5-2 5-5z" fill={C.skin} />
          <path d="M20 22c-3-4-9-3-9 2 0 4 5 7 9 10 4-3 9-6 9-10 0-5-6-6-9-2z" fill={C.orange} />
        </svg>
      );
    case "license":
      return (
        <svg {...common}>
          <rect x="5" y="9" width="30" height="22" rx="4" fill={C.yellow} />
          <circle cx="14" cy="18" r="4" fill={C.skin} />
          <path d="M8 29c0-4 3-6 6-6s6 2 6 6z" fill={C.navy} />
          <rect x="22" y="15" width="9" height="3" rx="1.5" fill={C.white} />
          <rect x="22" y="21" width="9" height="3" rx="1.5" fill={C.white} />
        </svg>
      );
    case "subscription":
      return (
        <svg {...common}>
          <rect x="11" y="4" width="18" height="32" rx="5" fill={C.navy} />
          <rect x="14" y="8" width="12" height="21" rx="2" fill={C.paper} />
          <circle cx="20" cy="32" r="1.8" fill={C.white} />
          <circle cx="20" cy="18" r="4" fill={C.orange} />
        </svg>
      );
    case "work":
      return (
        <svg {...common}>
          <rect x="5" y="13" width="30" height="20" rx="5" fill={C.navy} />
          <rect x="14" y="8" width="12" height="6" rx="2" fill={C.navyLight} />
          <rect x="5" y="20" width="30" height="3" fill={C.navyLight} />
          <rect x="17" y="19" width="6" height="5" rx="1.5" fill={C.yellow} />
        </svg>
      );
    case "community":
      return (
        <svg {...common}>
          <path d="M10 6v30" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M11 7h20l-4 6 4 6H11z" fill={C.blue} />
          <circle cx="26" cy="31" r="4" fill={C.green} />
          <circle cx="18" cy="33" r="3" fill={C.yellow} />
        </svg>
      );
    case "medical":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="15" fill={C.red} />
          <rect x="17" y="10" width="6" height="20" rx="2" fill={C.white} />
          <rect x="10" y="17" width="20" height="6" rx="2" fill={C.white} />
        </svg>
      );
    case "missing":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="30" height="21" rx="4" fill={C.paper} stroke={C.yellowDark} strokeWidth="2" strokeDasharray="4 3" />
          <path d="M5 13l15 10 15-10" fill="none" stroke={C.yellowDark} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="31" cy="11" r="5" fill={C.orange} />
          <text x="31" y="13.8" fontSize="8" textAnchor="middle" fill={C.white} fontWeight="700">
            ?
          </text>
        </svg>
      );
    case "money":
    case "other":
    default:
      return (
        <svg {...common}>
          <rect x="5" y="10" width="30" height="21" rx="4" fill={C.yellow} />
          <path d="M5 13l15 10 15-10" fill="none" stroke={C.yellowDark} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="31" cy="11" r="5" fill={C.orange} />
          <text x="31" y="13.5" fontSize="7" textAnchor="middle" fill={C.white} fontWeight="700">
            ¥
          </text>
        </svg>
      );
  }
}

/** 執事の絵（空っぽのとき・はじめて開いたとき） */
export function ButlerPic({ width = 150 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 110) / 120} viewBox="0 0 120 110" aria-hidden>
      <ellipse cx="60" cy="104" rx="38" ry="5" fill={C.shadow} opacity=".06" />
      <path d="M28 104c0-22 14-36 32-36s32 14 32 36z" fill={C.navy} />
      <path d="M52 70l8 20 8-20z" fill={C.white} />
      <path d="M53 74l7 5-7 5zM67 74l-7 5 7 5z" fill={C.orange} />
      <circle cx="60" cy="46" r="24" fill={C.skin} />
      <path d="M36 44c0-16 11-24 24-24s24 8 24 24c-4-8-12-12-24-12s-20 4-24 12z" fill={C.hair} />
      <circle cx="51" cy="48" r="2.6" fill={C.ink} />
      <circle cx="69" cy="48" r="2.6" fill={C.ink} />
      <path d="M50 57c3 3 6.5 4 10 4s7-1 10-4c-3 1-6 1.5-10 1.5S53 58 50 57z" fill={C.hair} />
      <circle cx="45" cy="55" r="3.5" fill={C.cheek} opacity=".6" />
      <circle cx="75" cy="55" r="3.5" fill={C.cheek} opacity=".6" />
      <g transform="rotate(12 97 76)">
        <rect x="86" y="62" width="22" height="28" rx="3" fill={C.paper} />
        <path d="M90 70h12M90 75h12M90 80h8" stroke={C.lineDark} strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="rotate(-10 16 83)">
        <rect x="4" y="74" width="24" height="18" rx="3" fill={C.yellow} />
        <path d="M4 77l12 7 12-7" fill="none" stroke={C.yellowDark} strokeWidth="2" />
      </g>
    </svg>
  );
}
