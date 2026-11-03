"use client";

// マイクのボタン。押して話すと、入力欄に文字が入る（ブラウザーの音声認識）。
// 初めて押したときは、声がどこへ行くかの正直な一言を出してから始める。対応していないブラウザーではボタンを出さず、案内だけ。

import { useEffect, useRef, useState } from "react";
import { markVoiceNoticeSeen, speechInputSupported, startListening, VOICE_NOTICE, voiceNoticeSeen } from "@/lib/voice";

export function MicButton({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef<(() => void) | null>(null);
  const base = useRef("");

  // ブラウザーの機能は画面を作ったあとに確かめる（サーバーでの描画と食い違わないように）
  useEffect(() => {
    setSupported(speechInputSupported());
    return () => stop.current?.();
  }, []);

  if (supported === null) return null;
  if (!supported) {
    return <p className="meta">このブラウザーでは声の入力ボタンが使えません。キーボードの音声入力（マイクの印）で話すこともできます。</p>;
  }

  function begin() {
    setError("");
    base.current = value.trim() ? `${value.trim()} ` : "";
    setListening(true);
    stop.current = startListening({
      onText: (text) => onChange(`${base.current}${text}`.slice(0, 200)),
      onEnd: () => {
        setListening(false);
        stop.current = null;
      },
      onError: (message) => {
        setError(message);
        setListening(false);
      },
    });
  }

  function press() {
    if (listening) {
      stop.current?.();
      return;
    }
    if (!voiceNoticeSeen()) {
      setNotice(true);
      return;
    }
    begin();
  }

  return (
    <div className="mic">
      <button
        type="button"
        className={`mic-button${listening ? " on" : ""}`}
        aria-pressed={listening}
        aria-label={listening ? "声の入力を止める" : "声で入力する"}
        onClick={press}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <span>{listening ? "聞いています…（押すと止まる）" : "声で話す"}</span>
      </button>
      {notice && (
        <div className="card mic-notice" role="dialog" aria-label="声の入力について">
          <div className="unchanging-title">声の入力について</div>
          <p>{VOICE_NOTICE}</p>
          <div className="row-actions">
            <button
              className="button small"
              style={{ width: "auto", margin: 0 }}
              onClick={() => {
                markVoiceNoticeSeen();
                setNotice(false);
                begin();
              }}
            >
              わかった、話す
            </button>
            <button className="button small secondary" style={{ width: "auto", margin: 0 }} onClick={() => setNotice(false)}>
              やめる
            </button>
          </div>
        </div>
      )}
      {error && <p className="meta" role="status">{error}</p>}
    </div>
  );
}
