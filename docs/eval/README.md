# 読み取りの正解率

`latest.md` は `scripts/eval-extraction.mts` が書き出した最新の表です。

- `npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts` … 仮の読み取り（正解そのもの）で、仕組みが動くことを確かめる（Claude を呼ばない）
- `npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts --claude` … 本物の Claude で読む（`ANTHROPIC_API_KEY` が要る。料金の見積もりは表の「料金」に）
- `--limit N`・`--ids g1,k6`・`--concurrency 2` で、一部だけ試せます

読み取りの生の結果は `scripts/out/eval/` に置き、コミットしません。
