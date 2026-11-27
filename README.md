# 臨時食品調理販売届メーカー

学校や町内会のバザー、お祭り、イベントで食品を出すときに保健所へ出す
**「臨時食品調理販売届」** 一式を、フォームとボタンで入力するだけで作るWebアプリです。

対象：高知県 **幡多福祉保健所** 管内
（[県のページ](https://www.pref.kochi.lg.jp/doc/hata_rinjishokuhin/)の2024年4月版様式）

ブラウザだけで動きます。サーバーは不要で、入力した氏名や住所は外部に送信されません。

## できること

- 県の**公式様式（PDF）にそのまま書き込んだ**提出用PDFを作ります
  - 臨時食品調理販売届（出店者が7件以上でもページを足して番号を振り直します）
  - ② 催事全体の平面図・各ブースのレイアウト図
  - ④ 臨時食品調理販売届における確認事項（☑も自動）
  - ⑤ 調理従事者名簿及び調理方法（保健所から求められたとき用。調理責任者を○で囲みます）
- **会場図・ブース図を画面上で作成**：「入口」「手洗い場」「加熱機器」などのボタンで部品を置き、
  ドラッグで移動、右下の■で大きさを変更、ダブルクリックで名前を変更。
  「出店者のブースを並べる」「標準レイアウトを置く」で下書きを自動作成
- **入力チェック**：提出期限（開催日の概ね2週間前）、年度4日を超える出店（営業許可が必要）、
  臨時届では原則出せない食品（おにぎり・カレー・サラダ・チョコバナナ等）などを画面右側で知らせます
- **調理工程の例文**：焼きそば・フランクフルト・かき氷などを選ぶと、下処理～現地の工程欄に例文が入ります
- **去年の書類から自動入力（インポート）**：次のファイルをまとめて選ぶか、ページに落とすだけで入力されます
  - Word で県の様式に書いた届・確認事項・調理従事者名簿（.docx）
  - Excel で作った平面図・ブース図（.xlsx）… 図形やセルの文字を、動かせる図面の部品として取り込みます
  - このアプリで作ったPDF（入力内容が埋め込まれています）や、エクスポートしたデータファイル（.json）

  去年のデータなら、開催日を1年後の同じ曜日に、「第○回」を次の回に、提出日を今日に自動で直し、
  見直すべき項目を一覧で表示します（古い .doc / .xls は Word / Excel で .docx / .xlsx に保存し直してください）
- **エクスポート**：データファイル（.json）か、データ入りの提出用PDFで保存できます。どちらも来年そのまま読み込めます
  （入力途中の内容はブラウザにも自動保存されます）

> チェック機能は目安です。提供できる食品などの最終判断は保健所が行います。迷ったら事前に相談してください。

## 公開のしかた（GitHub Pages）

1. このブランチを `main` にマージする
2. GitHub のリポジトリで **Settings → Pages** を開く
3. 「Build and deployment」の Source を **Deploy from a branch**、Branch を **`main` / `/docs`** にして Save
4. 数分後に `https://<ユーザー名>.github.io/hokenjo/` で使えるようになります

無料プランの場合、GitHub Pages を使うにはリポジトリを公開（Public）にする必要があります。

## 様式が改訂されたら

`.github/workflows/check-forms.yml` が毎週月曜に県のページを確認し、様式ファイルやページの更新日が変わっていたら
**「高知県の様式が更新されました」という Issue を自動で作ります**（手動で確認したいときは Actions タブから実行）。

Issue が来たら：

1. 県のページから新しいPDFをダウンロードし、`docs/forms/` の同じ名前のファイル
   （`todoke.pdf`＝届、`kakunin.pdf`＝確認事項、`meibo.pdf`＝名簿）を置き換える
2. 文字・罫線の位置を調べる：`pip install pymupdf` のあと `python tools/measure.py docs/forms/todoke.pdf`
3. `docs/lib/fill.js` の先頭にある `LAYOUT`（書き込む位置の一覧）を合わせる。項目が増減した場合は入力画面
   （`docs/index.html`、`docs/app.js`）とチェック（`docs/lib/rules.js`）も直す
4. `npm test` と、サンプルでPDFを作って目視で確認
5. `node tools/check-forms.mjs --update` で記録を更新してコミットし、Issue を閉じる

様式の座標は `LAYOUT` の1か所にまとめてあるので、レイアウトが少しずれただけなら数字を直すだけで済みます。

## 開発

```
docs/                 公開されるサイト一式（GitHub Pages の公開フォルダ）
  index.html          画面
  app.js              画面の動き（入力・保存・PDF作成）
  map.js              図面エディタ
  lib/fill.js         公式様式PDFへの書き込み（座標は LAYOUT に集約）
  lib/rules.js        入力チェックと和暦表記
  lib/ui.js           画面内ダイアログ
  forms/              県の公式様式・資料と、更新チェック用の記録（manifest.json）
  fonts/              IPA明朝（PDFに埋め込む日本語フォント）
  sample.json         初回表示用のサンプルデータ
  lib/importer.js     インポート（Word・Excel・PDF・JSON の読み取り）と今年用への更新
tests/                npm test（Node で docs/lib を動かす）、browser*.cjs（画面の通し確認）
  fixtures/           インポートのテスト用ファイル（実際の書類を元に、氏名・住所・電話番号を架空のものに置き換え済み）
tools/                様式の更新チェック、座標の測定
```

手元で動かす：

```bash
npm install
```

```bash
npm test
```

```bash
npm run serve
```

`npm run serve` のあと <http://localhost:8080> を開きます。

## ライセンスについて

- PDF生成：[pdf-lib](https://pdf-lib.js.org/)・[fontkit](https://github.com/Hopding/fontkit)（MIT）
- Word・Excel の読み取り：[JSZip](https://stuk.github.io/jszip/)（MIT）
- フォント：IPA明朝（[IPAフォントライセンスv1.0](docs/fonts/IPA_Font_License.txt)）
- 様式：高知県が公開している様式をそのまま使用しています

個人が作った非公式のツールで、高知県・保健所とは関係ありません。
