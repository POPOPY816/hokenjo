// 高知県のページの様式が変わっていないか確認する。
//   node tools/check-forms.mjs           … 変わっていれば内容を表示して終了コード 1
//   node tools/check-forms.mjs --update  … 今の状態を docs/forms/manifest.json に記録する（対応が終わったら実行）
// GitHub Actions（.github/workflows/check-forms.yml）が毎週これを動かし、変化があれば Issue を作る。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = "https://www.pref.kochi.lg.jp/doc/hata_rinjishokuhin/";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "docs", "forms", "manifest.json");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const clean = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "hokenjo-form-checker" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function current() {
  const html = (await get(PAGE)).toString("utf8");
  const updated = (html.match(/更新日\s*([0-9]{4}年[0-9]{2}月[0-9]{2}日)/) || [])[1] || "";
  const files = [];
  for (const m of html.matchAll(/href="([^"]*file_contents\/[^"]+\.(?:pdf|docx?|xlsx?))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(m[1], PAGE).href;
    if (files.some((f) => f.url === url)) continue;
    files.push({ title: clean(m[2]), url, sha256: sha256(await get(url)) });
  }
  return { page: PAGE, updated, files };
}

function diff(before, now) {
  const lines = [];
  if (before.updated !== now.updated) lines.push(`- ページの更新日: ${before.updated || "（なし）"} → ${now.updated || "（なし）"}`);
  const old = new Map(before.files.map((f) => [f.title, f]));
  const cur = new Map(now.files.map((f) => [f.title, f]));
  for (const [t, f] of cur) {
    if (!old.has(t)) lines.push(`- 追加: ${t}（${f.url}）`);
    else if (old.get(t).sha256 !== f.sha256 || old.get(t).url !== f.url) lines.push(`- 変更: ${t}（${f.url}）`);
  }
  for (const t of old.keys()) if (!cur.has(t)) lines.push(`- 削除: ${t}`);
  return lines;
}

const now = await current();
if (process.argv.includes("--update")) {
  fs.writeFileSync(MANIFEST, JSON.stringify(now, null, 2) + "\n");
  console.log(`記録しました（${now.files.length}ファイル、更新日 ${now.updated}）`);
  process.exit(0);
}
const before = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const changes = diff(before, now);
if (!changes.length) {
  console.log("様式に変化はありません");
  process.exit(0);
}
const report = `高知県のページ（${PAGE}）で様式に変化がありました。\n\n${changes.join("\n")}\n\n` +
  "対応手順は README の「様式が改訂されたら」を参照してください。対応後に `node tools/check-forms.mjs --update` を実行して記録を更新します。";
console.log(report);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `report<<EOF_REPORT\n${report}\nEOF_REPORT\n`);
}
process.exit(1);
