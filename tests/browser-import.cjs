// 画面からのインポート・エクスポートの通し確認（手動実行用）
//   python3 -m http.server 8080 --directory docs   （別ターミナル）
//   node tests/browser-import.cjs [スクリーンショットの保存先]
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { routeCdn } = require("./cdn.cjs");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "tmp");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8080/";
const FIX = (n) => path.join(__dirname, "fixtures", n);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await routeCdn(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector("#sample-banner:not([hidden])");

  // 去年の届・確認事項・平面図をまとめて選ぶ
  await page.setInputFiles("#file-input", [FIX("todoke.docx"), FIX("kakunin.docx"), FIX("heimenzu.xlsx")]);
  // Excel の図 → 会場の平面図に
  await page.click('.ui-dialog button[value="venue"]');
  // 過去のデータ → 今年用に更新
  await page.click('.ui-dialog button[value="roll"]');
  await page.waitForSelector(".ui-dialog h2:text('読み込みました')");
  const summary = await page.textContent(".ui-dialog p");
  console.log(summary);
  await page.screenshot({ path: path.join(OUT, "import-summary.png") });
  await page.click('.ui-dialog button[value="ok"]');

  const v = (sel) => page.inputValue(sel);
  const expect = (label, got, want) => { if (got !== want) errors.push(`${label}: ${got} != ${want}`); };
  expect("主催団体名", await v('[data-bind="organizer.name"]'), "みどり地区を守る会");
  expect("確認者", await v('[data-bind="organizer.checker"]'), "幡多 次郎");
  expect("開催名称", await v('[data-bind="event.name"]'), "みどりふるさと祭り");
  const start = await v('[data-bind="event.start_date"]');
  if (!(start > "2025-12-07")) errors.push("開催日が更新されていない: " + start);
  expect("出店者数", String((await page.$$(".shop")).length), "4");
  expect("1件目の食品", await page.inputValue('#shop-0 [data-f="foods"]'), "うどん");
  const venue = await page.$$("#venue-editor .item");
  if (venue.length < 15) errors.push("平面図の部品が少ない: " + venue.length);
  if (await page.isVisible("#sample-banner")) errors.push("サンプルの帯が消えていない");

  // Googleスライドの会場図（.pptx）：1枚目→平面図、2・3枚目→取り込まない、4枚目→出店者ごとに分ける
  await page.setInputFiles("#file-input", FIX("slides.pptx"));
  for (const v of ["venue", "skip", "skip", "split"]) await page.click(`.ui-dialog button[value="${v}"]`);
  await page.waitForSelector(".ui-dialog h2:text('読み込みました')");
  const deckSummary = await page.textContent(".ui-dialog p");
  if (!/ブース図 4件/.test(deckSummary)) errors.push("スライドのブース図が4件に分かれていない: " + deckSummary);
  await page.click('.ui-dialog button[value="ok"]');
  expect("スライド読み込み後も出店者は4件", String((await page.$$(".shop")).length), "4");
  const venueLabels = await page.$$eval("#venue-editor .item text", (els) => els.map((e) => e.textContent));
  if (!venueLabels.some((t) => t.includes("あいがもレース"))) errors.push("スライドの平面図が入っていない");
  await page.selectOption("#booth-shop", { index: 1 });
  const boothLabels = await page.$$eval("#booth-editor .item text", (els) => els.map((e) => e.textContent));
  if (!boothLabels.some((t) => t.includes("コンロ"))) errors.push("串焼きのブース図にコンロがない: " + boothLabels);

  await page.locator("#maps").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "import-maps.png") });

  // エクスポート：PDF（データ入り）を保存し、空にしてからそのPDFを読み込み直す
  await page.click("#btn-export");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.ui-dialog button[value="pdf"]')]);
  const pdfPath = path.join(OUT, "exported.pdf");
  await dl.saveAs(pdfPath);
  await page.click("#btn-new");
  await page.click('.ui-dialog button[value="ok"]');
  await page
    .waitForFunction(() => document.querySelector('[data-bind="organizer.name"]').value === "", null, { timeout: 3000 })
    .catch(async () => errors.push("空にした後: " + (await v('[data-bind="organizer.name"]'))));
  await page.setInputFiles("#file-input", pdfPath);
  await page.waitForSelector(".ui-dialog h2:text('読み込みました')");
  await page.click('.ui-dialog button[value="ok"]');
  expect("PDFから復元", await v('[data-bind="organizer.name"]'), "みどり地区を守る会");
  expect("PDFから復元（出店者数）", String((await page.$$(".shop")).length), "4");

  // エクスポート：データファイル
  await page.click("#btn-export");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click('.ui-dialog button[value="json"]')]);
  const jsonPath = path.join(OUT, "exported.json");
  await dl2.saveAs(jsonPath);
  const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  expect("JSON の出店者数", String(json.shops.length), "4");

  await browser.close();
  console.log("errors:", errors);
  process.exit(errors.length ? 1 : 0);
})();
