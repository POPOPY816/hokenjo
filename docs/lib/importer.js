// 昨年のデータの読み込み（インポート）と、今年用への更新。
//   - このアプリの保存ファイル（.json）
//   - このアプリで作ったPDF（入力内容を埋め込んである）
//   - 県の様式に Word で入力した届・確認事項・調理従事者名簿（.docx）
//   - Excel で作った平面図・ブース図（.xlsx の図形と文字 → 図面の部品）
// ブラウザでは window.Hokenjo.importer、Node では require() で使う。JSZip / pdf-lib は呼び出し側が渡す。
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else { root.Hokenjo = root.Hokenjo || {}; root.Hokenjo.importer = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PDF_DATA_KEY = "HokenjoData";

  // ---------------------------------------------------------------- XML（DOMParser のない Node でも動くよう正規表現で読む）

  const unescapeXml = (s) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, "&");

  // 同じ名前のタグの入れ子を考慮して、最上位の要素だけを取り出す
  function topLevel(xml, tag) {
    const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, "g");
    const out = [];
    let depth = 0, start = -1, m;
    while ((m = re.exec(xml))) {
      if (m[1]) { if (--depth === 0 && start >= 0) { out.push(xml.slice(start, re.lastIndex)); start = -1; } }
      else if (m[2]) { if (depth === 0) out.push(m[0]); }
      else { if (depth++ === 0) start = m.index; }
    }
    return out;
  }

  const runText = (xml) =>
    unescapeXml((xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || [])
      .map((t) => (t === "<w:tab/>" ? " " : t === "<w:br/>" ? "\n" : t.replace(/<[^>]+>/g, ""))).join(""));

  const paragraphs = (xml) => topLevel(xml, "w:p").map(runText);
  const clean = (s) => String(s || "").replace(/[　\s]+/g, " ").trim();
  const lines = (arr) => arr.map(clean).filter(Boolean);

  // 文書直下（表の外）の段落と、表（行 → セル → 段落）に分ける
  function docxStructure(xml) {
    const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
    const rawTables = topLevel(body, "w:tbl");
    const tables = rawTables.map((t) =>
      topLevel(t, "w:tr").map((tr) => topLevel(tr, "w:tc").map((tc) => paragraphs(tc))));
    let rest = body;
    for (const t of rawTables) rest = rest.replace(t, "");
    return { paras: paragraphs(rest), tables };
  }

  // ---------------------------------------------------------------- 日付

  const toHalf = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  // 「2025年12月7日（日）～8日」「令和7年12月7日」「12月7日～12月8日」などから日付を拾う
  function parseDates(text, fallbackYear) {
    const t = toHalf(text).replace(/元年/g, "1年");
    const out = [];
    let year = fallbackYear, month = null;
    const re = /(?:(令和|R)\s*(\d{1,2})\s*年|(\d{4})\s*[年/.-])?\s*(?:(\d{1,2})\s*[月/.-])?\s*(\d{1,2})\s*日?/g;
    let m;
    while ((m = re.exec(t))) {
      if (!m[0].trim()) { re.lastIndex++; continue; }
      if (m[2]) year = 2018 + +m[2];
      else if (m[3]) year = +m[3];
      if (m[4]) month = +m[4];
      const day = +m[5];
      // 年も月もない数字（「10:00」など）は日付として扱わない
      if (!m[4] && !m[2] && !m[3] && !/日/.test(m[0])) continue;
      if (year && month && day >= 1 && day <= 31) out.push(iso(year, month, day));
    }
    return out;
  }

  // ---------------------------------------------------------------- 届（Word）

  const SHOP_ROWS = [
    ["name", /^出店者/],
    ["permit", /^食品衛生法/],
    ["other", /^他の催物/],
    ["future_days", /^今後の出店/],
    ["foods", /^提供する食品/],
    ["quantity", /^提供予定数/],
    ["prep_facility", /^下処理施設(?!から)/],
    ["transport", /^下処理施設から/],
    ["prep_storage", /^下処理工程/],
    ["prep_process", /^下処理/],
    ["onsite_storage", /^現地での/],
    ["onsite_process", /^現地/],
  ];

  const TEL = /(?:\d{2,5}[-－ー‐(（)）]\d{1,4}[-－ー‐)）]\d{3,4}|0\d{9,10})/;
  const isTel = (s) => TEL.test(toHalf(s));
  const checked = (cellLines, word) => cellLines.some((l) => l.replace(/\s/g, "").includes(`☑${word}`));
  const digits = (s) => (toHalf(s).match(/\d+/) || [""])[0];

  function parseShopColumn(rows) {
    const s = {};
    for (const [key, cell] of Object.entries(rows)) {
      const ls = lines(cell);
      if (key === "name") {
        s.name = ls[0] || "";
        const rest = ls.slice(1);
        s.tel = rest.filter(isTel).join(" ");
        s.address = rest.filter((l) => !isTel(l)).join(" ");
        // 1行に「住所 電話」が並んでいる場合
        if (!s.tel) {
          const m = toHalf(s.address).match(TEL);
          if (m) { s.tel = m[0]; s.address = clean(toHalf(s.address).replace(m[0], "")); }
        }
      } else if (key === "permit") {
        s.has_permit = checked(ls, "有");
        s.permit_type = clean(ls.filter((l) => !/^[□☑]/.test(l)).join(" ").replace(/^業種[:：]?/, ""));
      } else if (key === "other") {
        s.other_events = checked(ls, "有");
        const yes = ls.find((l) => /有/.test(l)) || "";
        s.other_count = s.other_events ? digits(yes) : "";
      } else if (key === "future_days") {
        s.future_days = digits(ls.join(""));
      } else if (key === "quantity") {
        s.quantity = digits(ls.join(""));
      } else {
        s[key] = ls.join("\n");
      }
    }
    return s;
  }

  const FIELD = (label) => new RegExp(`^${label}\\s*(.*)$`);

  function parseTodoke(xml) {
    const { paras, tables } = docxStructure(xml);
    const org = {};
    const find = (re) => { for (const p of paras) { const m = clean(p).match(re); if (m) return clean(m[1]); } return ""; };
    org.name = find(FIELD("主催団体名"));
    org.representative = find(FIELD("代表者氏名"));
    org.address = find(/^住\s*所\s*(.*)$/);
    org.contact = find(FIELD("担当者氏名・連絡先"));

    const event = {};
    let submit = "";
    const head = paras.map(clean).find((p) => /年.*月.*日/.test(p) && !/届/.test(p));
    if (head) submit = parseDates(head)[0] || "";

    const shops = [];
    for (const table of tables) {
      const label = (row) => clean((row[0] || []).join(""));
      if (table.some((r) => /^開催期間/.test(label(r)))) {
        for (const r of table) {
          const value = lines(r.slice(1).flat()).join("\n");
          if (/^開催期間/.test(label(r))) {
            const ds = parseDates(value);
            event.start_date = ds[0] || "";
            event.end_date = ds.length > 1 ? ds[ds.length - 1] : "";
            const rest = clean(toHalf(value).replace(/(令和\s*\d+\s*年|\d{4}\s*年)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*([（(][^）)]*[）)])?|[～~〜]/g, " "));
            if (/\d/.test(rest)) event.time = rest;
          }
          if (/^開催名称/.test(label(r))) event.name = clean(value);
          if (/^開催場所/.test(label(r))) event.place = clean(value);
        }
        continue;
      }
      if (!table.some((r) => /^出店者/.test(label(r)))) continue;
      const cols = [{}, {}];
      for (const r of table) {
        const row = SHOP_ROWS.find(([, re]) => re.test(label(r)));
        if (!row) continue;
        const cells = r.slice(1);
        if (cells.length < 2) continue;
        const [a, b] = cells.slice(-2);
        cols[0][row[0]] = a;
        cols[1][row[0]] = b;
      }
      for (const c of cols) {
        const s = parseShopColumn(c);
        if (s.name || clean(s.foods)) shops.push(s);
      }
    }
    return { kind: "todoke", data: { submit_date: submit, organizer: org, event, shops } };
  }

  // ---------------------------------------------------------------- 確認事項（Word）

  const CHECK_PATTERNS = [
    ["supervisor", /統括者/], ["cooking_only", /調理を伴う取扱食品/], ["packaged_licensed", /調理を伴わない食品/],
    ["water_tap", /使用水は水道水/], ["water_other", /水道水以外の場合/],
    ["handwash_tank", /ポリタンク/], ["handwash_sink", /水道やシンク/],
    ["alcohol", /アルコール/], ["no_prep", /下処理（洗う/], ["simple_cook", /簡易な調理/],
    ["temperature", /クーラーボックス/], ["clothes", /清潔な服装/], ["sick", /体調不良/],
    ["eat_soon", /早めの喫食/], ["inform", /周知・遵守/], ["report", /保健所に報告|速やかに保健所/],
    ["meibo", /調理従事者名簿/],
  ];

  function parseKakunin(xml) {
    const { paras } = docxStructure(xml);
    const ps = paras.map(clean).filter(Boolean);
    const found = {};
    for (const p of ps) {
      const box = p.replace(/^[(（\s]+/, "");
      if (!/^[☑□]/.test(box)) continue;
      const pat = CHECK_PATTERNS.find(([, re]) => re.test(p));
      if (pat) found[pat[0]] = box[0] === "☑";
    }
    const checks = {};
    for (const [k, v] of Object.entries(found)) if (!/^(water|handwash)_/.test(k)) checks[k] = v;
    checks.water = !!(found.water_tap || found.water_other);
    checks.handwash = !!(found.handwash_tank || found.handwash_sink);
    const event = {};
    if (found.water_other && !found.water_tap) event.water = "other";
    if (found.handwash_sink && !found.handwash_tank) event.handwash = "sink";

    const org = {};
    const all = ps.join("\n");
    const sv = all.match(/氏名[:：]\s*([^）)]+)[）)]/);
    if (sv) org.supervisor = clean(sv[1]);
    const ck = all.match(/確認者\s*([^\n]+)/);
    if (ck) org.checker = clean(ck[1]);
    const nm = all.match(/主催団体名\s*([^\n]+)/);
    if (nm) org.name = clean(nm[1]);
    const rp = all.match(/代表者氏名\s*([^\n]+)/);
    if (rp) org.representative = clean(rp[1]);
    return { kind: "kakunin", data: { checks, organizer: org, event } };
  }

  // ---------------------------------------------------------------- 調理従事者名簿（Word）

  function parseMeibo(xml) {
    const { tables } = docxStructure(xml);
    const rows = [];
    for (const table of tables) {
      const header = (table[0] || []).map((c) => clean(c.join("")));
      if (!header.some((h) => h.includes("氏名"))) continue;
      const col = (word) => header.findIndex((h) => h.includes(word));
      const idx = { item: col("品目"), name: col("氏名"), address: col("住所"), tel: col("連絡先"), age: col("年齢"), role: col("工程") };
      for (const r of table.slice(1)) {
        const get = (k) => (idx[k] >= 0 && r[idx[k]] ? lines(r[idx[k]]) : []);
        const item = get("item").join(" ");
        if (/記入例/.test(item)) continue;
        const names = get("name");
        if (!names.length) continue;
        const addr = get("address"), tel = get("tel"), age = get("age");
        rows.push({
          item: item.replace(/（記入例）/, "").trim(),
          role: get("role").join("\n"),
          staff: names.map((n, i) => ({ name: n, address: addr[i] || "", tel: tel[i] || "", age: digits(age[i] || ""), leader: false })),
        });
      }
    }
    return { kind: "meibo", data: { meibo: rows } };
  }

  async function fromDocx(bytes, JSZip) {
    const zip = await JSZip.loadAsync(bytes);
    const file = zip.file("word/document.xml");
    if (!file) throw new Error("Word の文書として読めませんでした");
    const xml = await file.async("string");
    const text = runText(xml);
    // 届の添付書類欄にも「確認事項」「名簿」の名前が出てくるので、それぞれに固有の文言で見分ける
    if (/開催期間/.test(text) && /出店者/.test(text)) return parseTodoke(xml);
    if (/主催団体確認欄|上記のとおり.?確認のうえ/.test(text)) return parseKakunin(xml);
    if (/担当した調理工程/.test(text)) return parseMeibo(xml);
    return { kind: "unknown", data: {} };
  }

  // ---------------------------------------------------------------- 図（Excel）

  const EMU_PER_PX = 9525;

  // 列幅（文字数）・行高（pt）から、セルの左上のピクセル位置を求める
  function sheetGeometry(sheetXml) {
    const fmt = (sheetXml.match(/<sheetFormatPr[^>]*>/) || [""])[0];
    const attr = (s, a) => { const m = s.match(new RegExp(`\\b${a}="([\\d.]+)"`)); return m ? +m[1] : null; };
    const defW = attr(fmt, "defaultColWidth") ?? 8.43;
    const defH = attr(fmt, "defaultRowHeight") ?? 15;
    const colW = {};
    for (const c of sheetXml.match(/<col\s[^>]*>/g) || []) {
      const min = attr(c, "min"), max = attr(c, "max"), w = attr(c, "width");
      if (min && max && w != null) for (let i = min; i <= Math.min(max, 400); i++) colW[i - 1] = w;
    }
    const rowH = {};
    for (const r of sheetXml.match(/<row\s[^>]*>/g) || []) {
      const n = attr(r, "r"), h = attr(r, "ht");
      if (n && h != null) rowH[n - 1] = h;
    }
    const cw = (i) => Math.round((colW[i] ?? defW) * 7 + 5);
    const rh = (i) => ((rowH[i] ?? defH) * 96) / 72;
    const x = (col, off = 0) => { let v = 0; for (let i = 0; i < col; i++) v += cw(i); return v + off / EMU_PER_PX; };
    const y = (row, off = 0) => { let v = 0; for (let i = 0; i < row; i++) v += rh(i); return v + off / EMU_PER_PX; };
    return { x, y, cw, rh };
  }

  const colIndex = (ref) => ref.replace(/\d+/g, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  // 部品の種類を名前から推測する
  const GUESS = [
    ["handwash", /手洗/], ["toilet", /便所|トイレ/], ["entrance", /玄関|入口|出入口|出口/], ["hq", /本部|受付|案内/],
    ["eating", /休憩|飲食|イートイン|テーブル/], ["stage", /舞台|ステージ|イベントコーナー|会場$/], ["trash", /ゴミ|ごみ/],
    ["heat", /コンロ|鉄板|釜|フライヤー|グリル/], ["cooler", /冷蔵|冷凍|クーラー/], ["worktable", /作業台|加工台|調理台/],
    ["storage", /棚|収納|倉庫|資材/], ["booth", /販売|コーナー|ブース|店/],
  ];

  async function fromXlsx(bytes, JSZip, { shops = [] } = {}) {
    const zip = await JSZip.loadAsync(bytes);
    const sheetPath = Object.keys(zip.files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
    if (!sheetPath) throw new Error("Excel のシートが見つかりませんでした");
    const sheet = await zip.file(sheetPath).async("string");
    const g = sheetGeometry(sheet);
    const shared = zip.file("xl/sharedStrings.xml")
      ? topLevel(await zip.file("xl/sharedStrings.xml").async("string"), "si").map((si) =>
        unescapeXml((si.match(/<t(?:\s[^>]*)?>[^<]*<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
      : [];

    const raw = [];
    // 図形（テキストボックスなど）
    const drawingPath = Object.keys(zip.files).find((p) => /^xl\/drawings\/drawing\d+\.xml$/.test(p));
    if (drawingPath) {
      const dxml = await zip.file(drawingPath).async("string");
      for (const tag of ["xdr:oneCellAnchor", "xdr:twoCellAnchor", "xdr:absoluteAnchor"]) {
        for (const a of topLevel(dxml, tag)) {
          const text = clean(unescapeXml((a.match(/<a:t>[^<]*<\/a:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(" ")));
          const num = (re) => { const m = a.match(re); return m ? +m[1] : 0; };
          const from = a.match(/<xdr:from>[\s\S]*?<\/xdr:from>/);
          const to = a.match(/<xdr:to>[\s\S]*?<\/xdr:to>/);
          const pos = (blk) => blk && {
            x: g.x(+(/<xdr:col>(\d+)/.exec(blk[0]) || [0, 0])[1], +(/<xdr:colOff>(-?\d+)/.exec(blk[0]) || [0, 0])[1]),
            y: g.y(+(/<xdr:row>(\d+)/.exec(blk[0]) || [0, 0])[1], +(/<xdr:rowOff>(-?\d+)/.exec(blk[0]) || [0, 0])[1]),
          };
          let p0 = pos(from), w, h;
          if (to) { const p1 = pos(to); w = p1.x - p0.x; h = p1.y - p0.y; }
          else {
            if (!p0) p0 = { x: num(/<xdr:pos x="(-?\d+)"/) / EMU_PER_PX, y: num(/<xdr:pos [^>]*y="(-?\d+)"/) / EMU_PER_PX };
            w = num(/<xdr:ext cx="(\d+)"/) / EMU_PER_PX; h = num(/<xdr:ext [^>]*cy="(\d+)"/) / EMU_PER_PX;
          }
          const isLine = /cxnSp/.test(a) && !text;
          const hasOutline = /<a:ln[^/]*>(?![\s\S]{0,20}<a:noFill\/>)/.test(a);
          if (!text && (isLine || !hasOutline)) continue; // 文字のない線・装飾は取り込まない
          raw.push({ x: p0.x, y: p0.y, w: Math.max(w, 20), h: Math.max(h, 16), label: text });
        }
      }
    }
    // セルに直接書かれた文字（加工所の図などはこちら）
    for (const c of sheet.match(/<c\s[^>]*>[\s\S]*?<\/c>/g) || []) {
      const ref = (c.match(/\br="([A-Z]+)(\d+)"/) || []);
      if (!ref[1]) continue;
      let v = (c.match(/<v>([^<]*)<\/v>/) || [])[1];
      if (/t="s"/.test(c) && v != null) v = shared[+v];
      else if (/t="inlineStr"/.test(c)) v = unescapeXml((c.match(/<t[^>]*>([^<]*)<\/t>/) || [])[1] || "");
      v = clean(v);
      // 寸法・矢印・縮尺などは図面の部品にしない
      if (!v || /^[←→↑↓]$|^[\d.]+\s*(m|cm|mm)$|^S\s*[≒=]/.test(v)) continue;
      const col = colIndex(ref[1]), row = +ref[2] - 1;
      const w = Math.max(g.cw(col), v.length * 14 + 10);
      raw.push({ x: g.x(col), y: g.y(row), w, h: Math.max(g.rh(row), 24), label: v.replace(/^[●〇○]\s*/, ""), cell: true });
    }
    if (!raw.length) return { items: [], title: "" };

    // いちばん大きい文字（表題）は図面のタイトルとして扱う
    const title = raw.filter((r) => r.cell).map((r) => r.label).find((l) => /図|配置|会場|加工所|施設/.test(l)) || "";
    const parts = raw.filter((r) => r.label !== title).map((r) => ({ ...r, label: tidy(r.label) }));
    return { items: parts.map((r) => ({ ...r, type: guessType(r.label, shops) })), title };
  }

  // 「男 子 便 所」のように1文字ずつ空けた縦書き風の文字を詰める
  const tidy = (label) => {
    const t = label.replace(/^[●〇○]\s*/, "");
    return /^(\S\s)+\S$/.test(t) ? t.replace(/\s/g, "") : t;
  };

  function guessType(label, shops) {
    if (shops.some((s) => s.foods && foodsMatch(s.foods, label))) return "booth";
    const hit = GUESS.find(([, re]) => re.test(label.replace(/\s/g, "")));
    return hit ? hit[0] : "text";
  }

  const foodsMatch = (foods, label) => {
    const a = clean(foods).replace(/\s/g, ""), b = clean(label).replace(/\s/g, "");
    return !!a && !!b && (a.includes(b) || b.includes(a));
  };

  // 取り込んだ部品を、図面エディタの大きさに合わせて縮尺・配置する
  function fitItems(items, width, height, shops = [], margin = 30) {
    if (!items.length) return [];
    const minX = Math.min(...items.map((i) => i.x)), minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.w)), maxY = Math.max(...items.map((i) => i.y + i.h));
    const s = Math.min((width - margin * 2) / Math.max(maxX - minX, 1), (height - margin * 2) / Math.max(maxY - minY, 1), 2.5);
    const snap = (v) => Math.round(v / 10) * 10;
    return items.map((it, n) => {
      const w = Math.max(40, snap(it.w * s)), h = Math.max(30, snap(it.h * s));
      const shop = shops.find((sh) => sh.foods && foodsMatch(sh.foods, it.label));
      return {
        id: `imp${Date.now().toString(36)}${n}`,
        type: it.type,
        label: it.label,
        x: Math.min(width - w, Math.max(0, snap(margin + (it.x - minX) * s))),
        y: Math.min(height - h, Math.max(0, snap(margin + (it.y - minY) * s))),
        w, h,
        ...(shop ? { shopId: shop.id } : {}),
      };
    });
  }

  // ---------------------------------------------------------------- このアプリのPDF・保存ファイル

  async function fromPdf(bytes, PDFLib) {
    const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    const v = doc.getInfoDict().lookup(PDFLib.PDFName.of(PDF_DATA_KEY));
    if (!v) return null;
    return { kind: "app", data: JSON.parse(v.decodeText()) };
  }

  function embedInPdf(doc, data, PDFLib) {
    const { sample, ...rest } = data;
    doc.getInfoDict().set(PDFLib.PDFName.of(PDF_DATA_KEY), PDFLib.PDFHexString.fromText(JSON.stringify(rest)));
  }

  // ---------------------------------------------------------------- 今年用に更新

  const addDaysISO = (s, n) => {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };

  // 昨年のデータを今年用にする。変えた所（changes）と、毎年見直したい所（reviews）も返す
  function rollForward(data, today) {
    const d = JSON.parse(JSON.stringify(data));
    const changes = [], reviews = [];
    const ev = d.event || (d.event = {});
    const WD = "日月火水木金土";
    const label = (s) => { const [y, m, dd] = s.split("-").map(Number); return `${y}年${m}月${dd}日（${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}）`; };

    if (ev.start_date) {
      let shift = 0;
      // 52週（364日）ずつ進めて、同じ曜日のまま今日より後にする
      while (addDaysISO(ev.start_date, shift) < today) shift += 364;
      if (shift) {
        const old = ev.start_date;
        ev.start_date = addDaysISO(ev.start_date, shift);
        if (ev.end_date) ev.end_date = addDaysISO(ev.end_date, shift);
        changes.push(`開催日：${label(old)} → ${label(ev.start_date)}（同じ曜日）。日付が違う場合は直してください`);
        const years = Math.round(shift / 364);
        const name = ev.name || "";
        let next = name.replace(/第\s*([0-9０-９]+)\s*回/, (m, n) => `第${+toHalf(n) + years}回`);
        next = next.replace(/(20\d{2})/, (y) => (Math.abs(+y - +old.slice(0, 4)) <= 1 ? String(+y + years) : y));
        next = next.replace(/令和\s*([0-9０-９]+)\s*年/, (m, n) => `令和${+toHalf(n) + years}年`);
        if (next !== name) { ev.name = next; changes.push(`開催名称：${name} → ${next}`); }
      }
    } else {
      reviews.push("開催日が読み取れませんでした。入力してください");
    }
    if (d.submit_date !== today) { d.submit_date = today; changes.push("提出日を今日にしました"); }

    for (const s of d.shops || []) {
      if (s.other_events || s.other_count) {
        s.other_events = false; s.other_count = "";
      }
    }
    if ((d.shops || []).length) changes.push("出店者の「今年度ほかの催物への出店」をいったん「なし」に戻しました（年度が変わるため）");

    reviews.push(
      "出店者は去年と同じですか？（増えた・やめた出店者）",
      "提供する食品・提供予定数・仕入れ先",
      "主催者の代表者・担当者と連絡先",
      "下処理施設と調理工程",
      "会場図・ブース図の配置",
    );
    delete d.sample;
    return { data: d, changes, reviews };
  }

  // 読み込んだ断片を1つのデータにまとめる（後から読んだものが優先。空欄では上書きしない）
  function merge(base, part) {
    const out = JSON.parse(JSON.stringify(base));
    const fill = (dst, src) => {
      for (const [k, v] of Object.entries(src || {})) {
        if (v === "" || v == null) continue;
        dst[k] = v;
      }
    };
    if (part.submit_date) out.submit_date = part.submit_date;
    fill(out.organizer = out.organizer || {}, part.organizer);
    fill(out.event = out.event || {}, part.event);
    if (part.checks) Object.assign(out.checks = out.checks || {}, part.checks);
    if (part.shops && part.shops.length) out.shops = part.shops;
    if (part.meibo) {
      for (const row of part.meibo) {
        const shop = (out.shops || []).find((s) => foodsMatch(s.foods, row.item));
        if (shop) { shop.staff = row.staff; if (row.role) shop.meibo_role = row.role; }
      }
    }
    if (part.maps) out.maps = part.maps;
    if (part.include_meibo != null) out.include_meibo = part.include_meibo;
    return out;
  }

  return { fromDocx, fromXlsx, fromPdf, embedInPdf, fitItems, rollForward, merge, parseDates, PDF_DATA_KEY };
});
