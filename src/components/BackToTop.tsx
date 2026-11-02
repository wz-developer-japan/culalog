import Link from "next/link";

/** どの画面にも左上に出す「‹ トップ」。どこからでも1回でトップに戻れる */
export function BackToTop() {
  return (
    <div className="bar">
      <Link href="/" className="back">
        <svg className="l" viewBox="0 0 24 24" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        トップ
      </Link>
    </div>
  );
}
