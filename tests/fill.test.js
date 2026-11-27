// npm test で実行。ブラウザと同じ docs/lib/*.js を Node で動かして確認する
const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFLib, wareki, rules, fill, sample, build } = require("./helpers.js");

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const pageCount = async (bytes) => (await PDFLib.PDFDocument.load(bytes)).getPageCount();

test("和暦", () => {
  const d = wareki.parse("2026-12-19");
  assert.equal(wareki.full(d), "令和8年12月19日");
  assert.equal(wareki.period(d, wareki.parse("2026-12-20")), "令和8年12月19日（土）～12月20日（日）");
  assert.equal(wareki.reiwaYear(wareki.parse("2019-05-01")), "令和元");
  assert.equal(wareki.parse("2026-02-30"), null);
  assert.equal(wareki.zen(10), "１０");
});

test("サンプルで一式を作る（届2枚＋確認事項＋名簿）", async () => {
  const pdf = await build(sample());
  assert.equal(await pageCount(pdf), 5);
});

test("名簿なし・図面ありのページ構成", async () => {
  const data = { ...sample(), include_meibo: false };
  const images = { venue: PNG, booths: [{ label: "1", png: PNG }, { label: "2", png: PNG }, { label: "3", png: PNG }] };
  // 届1 + 出店者2 + 平面図1 + ブース図2（2件ずつ）+ 確認事項1
  assert.equal(await pageCount(await build(data, images)), 7);
});

test("出店者が7件以上なら届のページを増やす", async () => {
  const s = sample();
  const data = { ...s, include_meibo: false, shops: Array.from({ length: 9 }, (_, i) => ({ ...s.shops[0], name: `出店者${i + 1}` })) };
  // 届1 + 出店者9件で5ページ + 確認事項
  assert.equal(await pageCount(await build(data)), 7);
});

test("空のデータでも落ちない", async () => {
  assert.equal(await pageCount(await build({})), 3);
});

test("折り返し", async () => {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const lines = fill.wrap(font, "abcdefghij\nxyz", 10, 30);
  assert.ok(lines.length >= 3);
  assert.equal(lines.at(-1), "xyz");
});

test("入力チェック", () => {
  const s = sample();
  const msgs = rules.check(s, "2026-11-27").map((w) => w.message);
  assert.ok(msgs.some((m) => m.includes("フルーツ")));
  assert.ok(!msgs.some((m) => m.includes("年度4日を超え")));

  assert.ok(rules.check({ ...s, submit_date: "2026-12-15" }).some((w) => w.message.includes("2週間前")));

  const over = structuredClone(s);
  over.shops[0].other_count = 3;
  assert.ok(rules.check(over).some((w) => w.level === "error" && w.message.includes("年度4日を超え")));

  const blank = rules.check({});
  assert.ok(blank.some((w) => w.message.includes("主催団体名")));
});
