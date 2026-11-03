// 執事のアイコン（話し方の3人）。家族の丸と同じタッチ（線なし・丸い形・少ない色）で描き、
// 家族と一目で区別がつくよう、形は丸ではなく角丸の四角にする。蝶ネクタイが「執事」の印。
// 例外: 眼鏡だけは細い線で描く。絵はこのリポジトリで描いたもの（外の素材は使っていない）。

import type { CharacterId } from "@/lib/character";

const SKIN = "#f6d2b8";
const NAVY = "#3d4a6b";
const GRAY = "#9aa0ab";
const BROWN = "#5a3b2e";
const ORANGE = "#f08a3c";

/** 白いシャツの襟元と蝶ネクタイ（3人で共通） */
const Collar = ({ tie }: { tie: string }) => (
  <>
    <path d="M16.3 32.4 20 37.6l3.7-5.2c-1.2-.25-2.4-.35-3.7-.35s-2.5.1-3.7.35z" fill="#fff" />
    <path d="M16.4 33.6 20 35l3.6-1.4v3.2L20 35.4l-3.6 1.4z" fill={tie} />
    <circle cx="20" cy="35.2" r="1" fill={tie} />
  </>
);

export function ButlerFace({ id, size }: { id: CharacterId; size?: number }) {
  const common = { className: "bface", viewBox: "0 0 40 40", width: size, height: size, "aria-hidden": true as const };
  switch (id) {
    // クラノ: 眼鏡をかけた年配の男性の執事（白髪まじりの髪・口ひげ）
    case "kurano":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#ffe1cc" />
          <path d="M6.5 40c1-5.8 5.8-8.3 13.5-8.3s12.5 2.5 13.5 8.3z" fill={NAVY} />
          <Collar tie={NAVY} />
          <ellipse cx="20" cy="21" rx="9" ry="10" fill={SKIN} />
          <path
            d="M10.7 22.5c-1.2-7 2.4-12 9.3-12s10.5 5 9.3 12c-.5-2.6-1.4-4.3-2.8-5.1-.8-1.9-3.1-3-6.5-3s-5.7 1.1-6.5 3c-1.4.8-2.3 2.5-2.8 5.1z"
            fill={GRAY}
          />
          <path d="M15.6 27c1.5-1.5 3-1.7 4.4-.7 1.4-1 2.9-.8 4.4.7-1.6.5-3 .4-4.4-.3-1.4.7-2.8.8-4.4.3z" fill={GRAY} />
          <g fill="none" stroke={NAVY} strokeWidth="1.1">
            <circle cx="16" cy="22" r="2.9" />
            <circle cx="24" cy="22" r="2.9" />
            <path d="M18.9 21.8h2.2" />
          </g>
          <circle cx="16" cy="22.2" r="1.1" fill={NAVY} />
          <circle cx="24" cy="22.2" r="1.1" fill={NAVY} />
        </svg>
      );
    // フセン: 眼鏡をかけた女性の執事（まとめ髪）
    case "fusen":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#fff0bf" />
          <circle cx="20" cy="9.2" r="4.4" fill={BROWN} />
          <path d="M7.5 40c1-5.8 5.6-8.3 12.5-8.3s11.5 2.5 12.5 8.3z" fill={NAVY} />
          <Collar tie={ORANGE} />
          <ellipse cx="20" cy="22" rx="8.8" ry="9.8" fill={SKIN} />
          <path d="M10.9 22.8c-.4-6.8 3.5-11 9.1-11s9.5 4.2 9.1 11c-2.4-1.3-4.7-3.5-6-6.2-2.4 3-6.8 5.3-12.2 6.2z" fill={BROWN} />
          <g fill="none" stroke={BROWN} strokeWidth="1.1">
            <rect x="12.9" y="20.4" width="5.8" height="4.4" rx="2" />
            <rect x="21.3" y="20.4" width="5.8" height="4.4" rx="2" />
            <path d="M18.7 22.3h2.6" />
          </g>
          <circle cx="15.8" cy="22.7" r="1.1" fill={BROWN} />
          <circle cx="24.2" cy="22.7" r="1.1" fill={BROWN} />
          <path d="M17.6 27.2h4.8a2.4 2.4 0 0 1-4.8 0z" fill={BROWN} />
        </svg>
      );
    // ハコ: ロボットの執事（人にしない。父・母と見間違えないように）
    case "hako":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="11" fill="#dfe8f5" />
          <rect x="19.3" y="5.5" width="1.4" height="5" fill={NAVY} />
          <circle cx="20" cy="5.4" r="1.9" fill={ORANGE} />
          <path d="M9.5 40c.4-4.8 4-8 10.5-8s10.1 3.2 10.5 8z" fill="#fff" />
          <path d="M16.4 33.6 20 35l3.6-1.4v3.2L20 35.4l-3.6 1.4z" fill={ORANGE} />
          <rect x="6.6" y="16" width="3.2" height="7.5" rx="1.6" fill={NAVY} />
          <rect x="30.2" y="16" width="3.2" height="7.5" rx="1.6" fill={NAVY} />
          <rect x="9" y="10" width="22" height="19.5" rx="6.5" fill="#fff" />
          <rect x="12" y="13.3" width="16" height="12.6" rx="4.2" fill={NAVY} />
          <rect x="15" y="17" width="3" height="3.4" rx="1.5" fill={ORANGE} />
          <rect x="22" y="17" width="3" height="3.4" rx="1.5" fill={ORANGE} />
          <path d="M17.6 22.6h4.8" stroke={ORANGE} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
}
