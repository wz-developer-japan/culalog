"use client";

// マイクのボタン。押して話すと、入力欄に文字が入る（ブラウザーの音声認識）。
// 初めて押したときは、声がどこへ行くかの正直な一言を出してから始める。対応していないブラウザーではボタンを出さず、案内だけ。

import { useEffect, useRef, useState } from "react";
import { markVoiceNoticeSeen, onVoiceLog, speechInputSupported, startListening, VOICE_NOTICE, voiceLog, voiceNote, voiceNoticeSeen } from "@/lib/voice";

export function MicButton({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (text: string) => void;
  /** 声が文字にならなかったとき、「キーボードで話す」で入力欄にフォーカスを当てる（iPhone はボタンを押したときだけキーボードが出る） */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState("");
  const [stalled, setStalled] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const base = useRef("");
  const [log, setLog] = useState<string[]>([]);
  const [count, setCount] = useState(0);

  // ブラウザーの機能は画面を作ったあとに確かめる（サーバーでの描画と食い違わないように）
  useEffect(() => {
    setSupported(speechInputSupported());
    setLog(voiceLog());
    const off = onVoiceLog(() => setLog(voiceLog()));
    return () => {
      off();
      stop.current?.();
    };
  }, []);

  // 手がかり: 入力欄の文字数が変わったら記録（頼んだあとに文字が戻る、の切り分け用。文字そのものは残さない）
  const lastLength = useRef(-1);
  useEffect(() => {
    if (lastLength.current !== -1 && lastLength.current !== value.length && !listening) voiceNote(`入力欄: ${lastLength.current}→${value.length}文字`);
    lastLength.current = value.length;
  }, [value, listening]);

  if (supported === null) return null;
  if (!supported) {
    return <p className="meta">このブラウザーでは声の入力ボタンが使えません。キーボードの音声入力（マイクの印）で話すこともできます。</p>;
  }

  function begin() {
    setError("");
    setStalled(false);
    setCount((c) => c + 1);
    base.current = value.trim() ? `${value.trim()} ` : "";
    setListening(true);
    stop.current = startListening({
      onText: (text) => {
        voiceNote(`入力欄に書いた（${text.length}文字）`);
        onChange(`${base.current}${text}`.slice(0, 200));
      },
      onEnd: () => {
        setListening(false);
        stop.current = null;
      },
      onError: (message, kind) => {
        setError(message);
        setStalled(kind === "stalled");
        // 入力欄に寄せておく（キーボードは「キーボードで話す」を押したときに出る）
        if (kind === "stalled") inputRef?.current?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      {stalled && inputRef && (
        <button
          type="button"
          className="button secondary small"
          onClick={() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
            setStalled(false);
          }}
        >
          キーボードで話す（入力欄を開く）
        </button>
      )}
      {log.length > 0 && (
        <details className="meta voice-log">
          <summary>声の入力の手がかり（開発用・この画面で{count}回押した）</summary>
          <p>試し方: 1回目に話す → 頼む → そのまま2回目に話す → 頼む → 3回目に話す。「画面を読み込んだ」が途中に出ていたら、読み込み直しが起きています。うまくいかなかったら、ここを開いて画面を撮ってください（話した文字は残していません。文字数だけです）。</p>
          <pre>{log.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
