"use client";

// 設定: 声で話すこと（どこへ行くかの正直な一言）と、執事の答えの読み上げのオン・オフ（この端末だけの設定）。

import { useEffect, useState } from "react";
import { readAloudEnabled, setReadAloud, speak, speechInputSupported, speechOutputSupported, VOICE_NOTICE } from "@/lib/voice";

export function VoiceSettings() {
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [input, setInput] = useState(false);
  const [output, setOutput] = useState(false);
  useEffect(() => {
    setOn(readAloudEnabled());
    setInput(speechInputSupported());
    setOutput(speechOutputSupported());
    setReady(true);
  }, []);
  if (!ready) return null;
  return (
    <>
      <h2>声</h2>
      <div className="card">
        <div className="unchanging-title">声で話す（聞く画面のマイクのボタン）</div>
        <p>{VOICE_NOTICE}</p>
        {!input && <p className="meta">このブラウザーでは声の入力ボタンが使えません。キーボードの音声入力（マイクの印）で話すこともできます。</p>}
      </div>
      {output ? (
        <label className="card check-row">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              setReadAloud(e.target.checked);
              setOn(e.target.checked);
              if (e.target.checked) speak("執事の答えを読み上げます。");
            }}
          />
          <span>
            執事の答えを読み上げる
            <span className="block meta">この端末だけの設定です。読み上げはお使いのブラウザーの機能です。iPhone では、答えのカードの「読み上げる」を押したときだけ読むことがあります。</span>
          </span>
        </label>
      ) : (
        <p className="meta">このブラウザーでは読み上げが使えません。</p>
      )}
    </>
  );
}
