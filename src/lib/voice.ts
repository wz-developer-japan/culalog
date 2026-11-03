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
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onaudioend?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechInputSupported = () => recognitionCtor() !== null;

/*
 * 手がかりの記録（開発用）: 声の入力の流れ（何回目・始まった・音が入った・結果・エラーの種類・終わった）を、
 * 画面（聞く画面の「声の入力の手がかり」）と console に出す。声そのものや話した文字は残さない（文字数だけ）
 */
const log: string[] = [];
const logListeners = new Set<() => void>();
let session = 0;
// 画面の読み込み直しを見分ける印（同じタブのあいだだけ数える）。ログの #番号 が戻ったら、読み込み直しが起きている
let loadNo = 0;
let loadNoted = false;
function noteLoad() {
  if (loadNoted || typeof window === "undefined") return;
  loadNoted = true;
  try {
    loadNo = Number(sessionStorage.getItem("culalog.voiceLoads") ?? "0") + 1;
    sessionStorage.setItem("culalog.voiceLoads", String(loadNo));
  } catch {
    loadNo = 1;
  }
  note(`画面を読み込んだ（このタブで${loadNo}回目）`);
  document.addEventListener("visibilitychange", () => note(`画面が${document.visibilityState === "visible" ? "前に出た" : "裏に回った"}`));
}
function note(line: string) {
  const d = new Date();
  const t = `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  log.push(`${t} ${line}`);
  if (log.length > 40) log.shift();
  console.info(`[声の入力] ${line}`);
  for (const l of logListeners) l();
}
export const voiceLog = () => {
  noteLoad();
  return [...log];
};
export function onVoiceLog(listener: () => void): () => void {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
}

/** いま動いている認識（同時に2つ動かさない。前の認識がマイクを離しきる前に次を始めない） */
let active: { recognition: Recognition; id: number; ended: Promise<void> } | null = null;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "マイクが許可されていません。ブラウザーの設定でマイクを許可するか、キーボードの音声入力を使ってください。",
  "service-not-allowed": "この端末では声の入力が許可されていません。キーボードの音声入力を使ってください。",
  "no-speech": "声が聞き取れませんでした。もう一度押して話してください。",
  "audio-capture": "マイクの音が届きませんでした。もう一度押すか、キーボードのマイク（音声入力）で話してください。",
};

/**
 * 話し始める。onText には、これまでに聞き取った文字（途中も含む）を毎回渡す。止めると onEnd。
 * 返す関数で止められる。
 * iPhone の Safari で2回目が失敗したため: 毎回 new し、前の認識は止めて終わるのを待ってから始める。
 * 終わった認識から遅れて届くイベントは無視する。結果が確定したら自分で stop してマイクを離す。
 * 始めてすぐ aborted・audio-capture になったら、少し待って1回だけやり直す。
 */
export function startListening(handlers: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError("このブラウザーでは声の入力が使えません。");
    return () => undefined;
  }
  noteLoad();
  const id = ++session;
  // iPhone: 音の経路を読み上げに取られないよう止める。入力欄・ボタンのフォーカス（キーボード）も外す
  try {
    if (speechOutputSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) note(`#${id} 読み上げ中だったので止めた`);
    window.speechSynthesis?.cancel();
  } catch {
    // 読み上げの機能が無い
  }
  try {
    (document.activeElement as HTMLElement | null)?.blur?.();
  } catch {
    // フォーカスが無い
  }
  let cancelled = false;
  let finished = false;
  let current: Recognition | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    handlers.onEnd();
  };

  const begin = (attempt: number) => {
    if (cancelled) return finish();
    const recognition = new Ctor();
    current = recognition;
    let resolveEnded: () => void = () => undefined;
    const ended = new Promise<void>((r) => (resolveEnded = r));
    active = { recognition, id, ended };
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;
    let gotResult = false;
    let startedAt = Date.now();
    let retrying = false;
    // 1回の試みで出す知らせは最初のエラーだけ（audio-capture のあとに届く aborted で上書きしない）
    let errored = false;
    const mine = () => active?.recognition === recognition;
    recognition.onstart = () => {
      startedAt = Date.now();
      note(`#${id} 始まった（${attempt}回目の試み）`);
    };
    recognition.onaudiostart = () => note(`#${id} 音が入りはじめた`);
    recognition.onaudioend = () => note(`#${id} 音が止まった`);
    recognition.onresult = (event) => {
      if (!mine()) return note(`#${id} 古い認識の結果を無視`);
      let text = "";
      let final = true;
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
        if (!event.results[i].isFinal) final = false;
      }
      gotResult = true;
      note(`#${id} 結果 ${text.length}文字${final ? "（確定）" : ""}`);
      handlers.onText(text, final);
      // 確定したら自分で止めてマイクを離す（次に押したときに前の認識が残っていないように）
      if (final) {
        try {
          recognition.stop();
        } catch {
          // すでに止まっている
        }
      }
    };
    recognition.onerror = (event) => {
      note(`#${id} エラー: ${event.error}${event.message ? `（${event.message}）` : ""}`);
      if (!mine() || retrying) return;
      // 始めてすぐの aborted・audio-capture は、前の認識がマイクを離しきっていないことが多い → 少し待って1回だけやり直す。
      // iPhone の audio-capture（Source is muted: マイクは開いたが無音が来る）は、時間に関係なく1回だけ新しい認識でやり直す
      const muted = event.error === "audio-capture";
      if (!gotResult && !cancelled && attempt === 1 && (muted || (event.error === "aborted" && Date.now() - startedAt < 1500))) {
        retrying = true;
        return;
      }
      if (cancelled && event.error === "aborted") return;
      if (gotResult && (event.error === "no-speech" || event.error === "aborted")) return;
      if (errored) return;
      errored = true;
      handlers.onError(`${ERROR_MESSAGES[event.error] ?? "声の入力がうまくいきませんでした。キーボードの音声入力も使えます。"}（手がかり: ${event.error}）`);
    };
    recognition.onend = () => {
      note(`#${id} 終わった`);
      resolveEnded();
      if (active?.recognition === recognition) active = null;
      if (retrying) {
        note(`#${id} 少し待ってやり直す`);
        setTimeout(() => begin(attempt + 1), 600);
        return;
      }
      finish();
    };
    try {
      recognition.start();
    } catch (e) {
      note(`#${id} start で失敗: ${(e as Error).name}`);
      resolveEnded();
      if (active?.recognition === recognition) active = null;
      if (attempt === 1 && !cancelled) {
        setTimeout(() => begin(attempt + 1), 400);
        return;
      }
      handlers.onError(`声の入力を始められませんでした。（手がかり: start ${(e as Error).name}）`);
      finish();
    }
  };

  // 前の認識が残っていれば止めて、終わるのを待ってから（長くても 800ms）始める
  const previous = active;
  if (previous) {
    note(`#${id} 前の認識 #${previous.id} を止めてから始める`);
    try {
      previous.recognition.abort ? previous.recognition.abort() : previous.recognition.stop();
    } catch {
      // すでに止まっている
    }
    active = null;
    Promise.race([previous.ended, new Promise((r) => setTimeout(r, 800))]).then(() => setTimeout(() => begin(1), 150));
  } else {
    begin(1);
  }

  return () => {
    cancelled = true;
    note(`#${id} 止めるボタン`);
    try {
      current?.stop();
    } catch {
      // すでに止まっている
    }
    if (!current) finish();
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
