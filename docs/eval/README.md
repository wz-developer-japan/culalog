# 読み取りの正解率

`latest.md` は `scripts/eval-extraction.mts` が書き出した最新の表です。
いま載っているのは、**本物の Claude（claude-opus-5-5）の結果**です（2026-11-06。手元に API キーが無かったため、本番の `/api/extract` で見本86件を1件ずつ読ませた: `--via https://culalog.vercel.app --concurrency 1`）。
落ちた項目・満点でなかった書類・本番で読めなかった書類（時間切れ・混み合い・大きさの上限）も、良い数字だけを選ばずにそのまま載せています。読めなかった書類は点に入れず、件数と名前を別に書いています。

- `npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts` … 仮の読み取り（正解そのもの）で、仕組みが動くことを確かめる（Claude を呼ばない）
- `npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts --claude` … 本物の Claude で読む（`ANTHROPIC_API_KEY` が要る。料金の見積もりは表の「料金」に）
- `npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts --via https://culalog.vercel.app` … 手元にキーが無いとき、出してあるアプリの `/api/extract` で読む（1時間あたりの上限に当たったら、Retry-After の秒だけ待って同じ件をやり直す）
- `--limit N`・`--ids g1,k6`・`--concurrency 2` で、一部だけ試せます。`--resume` は、`scripts/out/eval/` に読み取りの結果が残っている見本を読み直さない（途中で止まったときの続き）

読み取りの生の結果は `scripts/out/eval/` に置き、コミットしません（`readings.json` は { id: 読み取り結果 } の形で、ほかの採点と照らし合わせるときにも使えます）。

正解率の採点はこのスクリプトを正とし、採点の決め方（予定は同じ日付で名前の語も重なれば1点・日付だけなら半分、正解に無い日付を締切にしたら落とす、など）は表の末尾の「数え方」に書いています。
