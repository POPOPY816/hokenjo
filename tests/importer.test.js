// 去年の書類の読み込み（インポート）のテスト。fixtures は実際の届を元に個人情報を置き換えたもの
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const importer = require("../docs/lib/importer.js");
const { PDFLib, sample, build } = require("./helpers.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name));

test("Word の届を読み取る", async () => {
  const { kind, data } = await importer.fromDocx(fixture("todoke.docx"), JSZip);
  assert.equal(kind, "todoke");
  assert.deepEqual(data.organizer, {
    name: "みどり地区を守る会", representative: "四万十 太郎", address: "高知県四万十市中村1-1", contact: "090-0000-0000（幡多）",
  });
  assert.equal(data.event.start_date, "2025-12-07");
  assert.equal(data.event.name, "みどりふるさと祭り");
  assert.equal(data.event.place, "みどり中学校グラウンド");
  assert.deepEqual(data.shops.map((s) => s.foods), ["うどん", "串焼き", "フライドポテト", "フランクフルト"]);
  const [udon, , potato] = data.shops;
  assert.equal(udon.name, "山田はなこ");
  assert.equal(udon.address, "高知県四万十市具同");
  assert.equal(udon.quantity, "200");
  assert.equal(udon.prep_facility, "みどり地区集会所調理室");
  assert.equal(udon.onsite_process, "仕入れ先：フジ・業務スーパー\nゆでる⇒提供");
  assert.equal(udon.has_permit, false);
  assert.equal(potato.has_permit, true);
  assert.equal(potato.other_events, true);
  assert.equal(potato.future_days, ""); // 「未定」
});

test("Word の確認事項を読み取る", async () => {
  const { kind, data } = await importer.fromDocx(fixture("kakunin.docx"), JSZip);
  assert.equal(kind, "kakunin");
  assert.equal(data.organizer.supervisor, "四万十太郎");
  assert.equal(data.organizer.checker, "幡多 次郎");
  assert.equal(data.checks.supervisor, true);
  assert.equal(data.checks.water, true);
  assert.equal(data.checks.meibo, true);
});

test("Excel の平面図を図面の部品にする", async () => {
  const shops = [{ id: "a", foods: "うどん" }, { id: "b", foods: "串焼き" }];
  const r = await importer.fromXlsx(fixture("heimenzu.xlsx"), JSZip, { shops });
  assert.equal(r.title, "施設の配置図");
  const labels = r.items.map((i) => i.label);
  for (const l of ["本部", "うどん", "串焼き", "男子便所", "●手洗場・消毒設備"].map((x) => x.replace("●", "")))
    assert.ok(labels.some((x) => x.includes(l)), l);
  const items = importer.fitItems(r.items, 960, 640, shops);
  for (const it of items) {
    assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= 960 && it.y + it.h <= 640, JSON.stringify(it));
  }
  assert.equal(items.find((i) => i.label === "うどん").shopId, "a");
  assert.equal(items.find((i) => i.label === "男子便所").type, "toilet");
  assert.equal(items.find((i) => i.label === "本部").type, "hq");
});

test("セルに書いた図（加工所）も読み取る", async () => {
  const r = await importer.fromXlsx(fixture("kakojo.xlsx"), JSZip);
  const labels = r.items.map((i) => i.label);
  for (const l of ["回転釜", "冷蔵庫", "手洗い", "コンロ"]) assert.ok(labels.includes(l), l);
  assert.ok(!labels.some((l) => /^[←→↑↓]$|^\d+(cm|m)$/.test(l)), "寸法や矢印は部品にしない");
});

test("今年用に更新する", () => {
  const data = { submit_date: "2025-11-28", event: { name: "第10回 みどりふるさと祭り2025", start_date: "2025-12-07", end_date: "2025-12-08" }, shops: [{ other_events: true, other_count: "2" }] };
  const { data: d, changes, reviews } = importer.rollForward(data, "2026-11-27");
  assert.equal(d.event.start_date, "2026-12-06"); // 同じ日曜日
  assert.equal(d.event.end_date, "2026-12-07");
  assert.equal(d.event.name, "第11回 みどりふるさと祭り2026");
  assert.equal(d.submit_date, "2026-11-27");
  assert.equal(d.shops[0].other_events, false);
  assert.ok(changes.length >= 3 && reviews.length >= 3);
});

test("日付の読み取り", () => {
  assert.deepEqual(importer.parseDates("2025年12月7日（日）"), ["2025-12-07"]);
  assert.deepEqual(importer.parseDates("令和7年12月7日（日）～12月8日（月）"), ["2025-12-07", "2025-12-08"]);
  assert.deepEqual(importer.parseDates("２０２５年１２月７日"), ["2025-12-07"]);
});

test("届と確認事項をまとめる", async () => {
  const todoke = await importer.fromDocx(fixture("todoke.docx"), JSZip);
  const kakunin = await importer.fromDocx(fixture("kakunin.docx"), JSZip);
  let d = importer.merge({ organizer: {}, event: {}, checks: {}, shops: [{}] }, todoke.data);
  d = importer.merge(d, kakunin.data);
  assert.equal(d.shops.length, 4);
  assert.equal(d.organizer.contact, "090-0000-0000（幡多）");
  assert.equal(d.organizer.checker, "幡多 次郎");
  assert.equal(d.checks.handwash, true);
});

test("このアプリで作ったPDFから入力内容を復元する", async () => {
  const data = sample();
  const pdf = await build(data);
  const r = await importer.fromPdf(pdf, PDFLib);
  assert.equal(r.kind, "app");
  assert.equal(r.data.event.name, data.event.name);
  assert.equal(r.data.shops.length, data.shops.length);
  assert.deepEqual(r.data.maps.venue, data.maps.venue);
  // 県の様式そのもの（データなし）は null
  assert.equal(await importer.fromPdf(fs.readFileSync(path.join(__dirname, "..", "docs", "forms", "todoke.pdf")), PDFLib), null);
});
