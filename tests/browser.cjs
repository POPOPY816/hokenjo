// 画面の通し確認（手動実行用）：入力 → 図面作成 → PDF保存 → スマホ幅の表示
//   python3 -m http.server 8080 --directory docs   （別ターミナル）
//   node tests/browser.cjs [スクリーンショットの保存先]
// CDN（jsdelivr）へのアクセスは node_modules の同じファイルで代用する。
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "tmp");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8080/";
fs.mkdirSync(OUT, { recursive: true });

const { routeCdn: setup } = require("./cdn.cjs");

(async () => {
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
await setup(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE);
await page.waitForSelector("#sample-banner:not([hidden])");
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "top.png") });

// 会場図：ブースを並べ、入口・手洗い場を足す
await page.click("#btn-place-booths");
await page.click('#venue-editor .map-palette >> text=入口');
await page.click('#venue-editor .map-palette >> text=手洗い場（液体石けん）');
// 名前変更ダイアログ（ページ内）
await page.click('#venue-editor [data-act="rename"]');
await page.fill("#ui-dialog-input", "入口（北側）");
await page.click('.ui-dialog button[value="ok"]');
await page
  .waitForFunction(() => document.querySelector("#venue-editor .item.sel text")?.textContent.includes("入口（北側）"), null, { timeout: 3000 })
  .catch(async () => errors.push("rename failed: " + (await page.textContent("#venue-editor .item.sel text"))));

// ブース図：1件目と3件目に標準レイアウト（描いてあれば置き換えの確認に「OK」）
const standard = async () => {
  await page.click("#btn-booth-standard");
  const ok = page.locator('.ui-dialog button[value="ok"]');
  if (await ok.isVisible({ timeout: 500 }).catch(() => false)) await ok.click();
};
await standard();
await page.selectOption("#booth-shop", { index: 2 });
await standard();

// PDFを保存
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download")]);
const pdfPath = path.join(OUT, "app.pdf");
await dl.saveAs(pdfPath);
console.log("pdf bytes", fs.statSync(pdfPath).size);

await page.locator("#maps").scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(OUT, "maps.png") });

// 削除の確認ダイアログ（キャンセル）
await page.click('#shop-1 [data-act="del"]');
await page.click('.ui-dialog button[value="cancel"]');
if ((await page.$$(".shop")).length !== 3) errors.push("cancel delete failed");

const state = await page.evaluate(() => localStorage.getItem("hokenjo-rinji-v1"));
fs.writeFileSync(path.join(OUT, "state.json"), state);

// スマホ幅・ダークモード
const mctx = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "dark" });
await setup(mctx);
const m = await mctx.newPage();
m.on("pageerror", (e) => errors.push("mobile: " + e.message));
await m.goto(BASE + "#shops");
await m.waitForTimeout(1000);
const sw = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
if (sw[0] > sw[1]) errors.push("horizontal scroll on mobile: " + sw);
await m.screenshot({ path: path.join(OUT, "mobile-dark.png") });

await browser.close();
console.log("errors:", errors);
process.exit(errors.length ? 1 : 0);
})();
