// 声で話す（ブラウザーの音声認識）と、執事の答えの読み上げ（ブラウザーの音声合成）。
// 🔴 声を文字にするのはブラウザーの機能。声そのものは CULALOG のサーバーにも Claude にも送らない。
// 設定（初めての案内を見たか・読み上げのオンオフ）はこの端末の好みとして localStorage に置く（家のデータには入れない）。

/** 初めてマイクを押したとき・設定に出す、正直な一言 */
export const VOICE_NOTICE =
  "声を文字にするのは、お使いのブラウザーの音声認識です（Chrome は Google、Safari は Apple のサーバーを使うことがあります）。声は CULALOG のサーバーにも Claude にも送りません。文字になったあとは、聞くときと同じ扱いです。";

const NOTICE_KEY = "culalog.voiceNoticeSeen";
const READ_ALOUD_KEY = "culalog.readAloud";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できない（プライベートブラウズなど）ときは、その場だけ
  }
}

export const voiceNoticeSeen = () => get(NOTICE_KEY) === "1";
export const markVoiceNoticeSeen = () => set(NOTICE_KEY, "1");
export const readAloudEnabled = () => get(READ_ALOUD_KEY) === "1";
export const setReadAloud = (on: boolean) => set(READ_ALOUD_KEY, on ? "1" : "0");

/* ブラウザーの音声認識（型はブラウザーごとに違うので、使う所だけ） */
interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechInputSupported = () => recognitionCtor() !== null;

/**
 * 話し始める。onText には、これまでに聞き取った文字（途中も含む）を毎回渡す。止めると onEnd。
 * 返す関数で止められる
 */
export function startListening(handlers: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError("このブラウザーでは声の入力が使えません。");
    return () => undefined;
  }
  const recognition = new Ctor();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    let final = true;
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
      if (!event.results[i].isFinal) final = false;
    }
    handlers.onText(text, final);
  };
  recognition.onerror = (event) => {
    const message =
      event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "マイクが許可されていません。ブラウザーの設定でマイクを許可するか、キーボードの音声入力を使ってください。"
        : event.error === "no-speech"
          ? "声が聞き取れませんでした。もう一度押して話してください。"
          : "声の入力がうまくいきませんでした。キーボードの音声入力も使えます。";
    handlers.onError(message);
  };
  recognition.onend = () => handlers.onEnd();
  try {
    recognition.start();
  } catch {
    handlers.onError("声の入力を始められませんでした。");
  }
  return () => {
    try {
      recognition.stop();
    } catch {
      // すでに止まっている
    }
  };
}

export const speechOutputSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** 読み上げる（前の読み上げは止める）。読み上げられないブラウザーでは何もしない */
export function speak(text: string) {
  if (!speechOutputSupported() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[「」（）()]/g, " "));
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  } catch {
    // 読み上げられなかった（端末の設定など）
  }
}

/** 読み上げがオンなら読み上げる（頼みごとの答えが届いたとき。iPhone では、ボタンを押したとき以外は読まないことがある） */
export function speakIfEnabled(text: string) {
  if (readAloudEnabled()) speak(text);
}
