// 県の公式様式（PDF）の上に入力内容を書き込んで、提出用PDFを1つにまとめる。
// ブラウザでは window.Hokenjo.fill、Node では require() で使う（pdf-lib と fontkit は呼び出し側が渡す）。
//
// 座標は docs/forms/*.pdf（幡多福祉保健所 2024年4月版）から実測した値で、すべて下の LAYOUT にまとめてある。
// 単位は pt、原点はページ左上（y は下向き）。様式が改訂されたら tools/measure.py で測り直して LAYOUT を直す。
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else { root.Hokenjo = root.Hokenjo || {}; root.Hokenjo.fill = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LAYOUT = {
    files: { todoke: "forms/todoke.pdf", kakunin: "forms/kakunin.pdf", meibo: "forms/meibo.pdf", font: "fonts/ipam.ttf" },

    // 臨時食品調理販売届 1ページ目
    todoke: {
      date: { year: [370, 111, 428, 125.5], month: [441, 111, 471, 125.5], day: [483, 111, 513, 125.5] },
      organizer: {
        name: [352, 245.5, 560, 261],
        representative: [352, 267.5, 560, 283],
        address: [352, 289.5, 560, 305],
        contact: [352, 311.5, 560, 327],
      },
      period: [156, 417, 516, 457],
      eventName: [156, 461, 516, 499],
      place: [156, 502.5, 516, 541],
    },

    // 出店者欄（原本の2～4ページ目。1ページに2件）
    shop: {
      templatePages: [1, 2, 3],
      cols: [[223.2, 374.8], [374.8, 529.4]],
      rows: {
        number: [88.8, 108.4],
        name: [108.4, 162.4],
        foods: [324.4, 360.4],
        prep_facility: [415.8, 469.3],
        transport: [469.3, 523.3],
        prep_process: [542.8, 607.7],
        prep_storage: [607.7, 672.7],
        onsite_process: [672.7, 737.8],
        onsite_storage: [737.8, 802.8],
      },
      // 列の左端 x0 からの相対位置
      boxX: 5.6, // □の左端
      permitYes: 164.3, permitNo: 218.8, permitType: [177, 216],
      otherYes: 242.7, otherNo: 269.9, otherCount: [37.2, 240.5, 68.6, 255.5],
      days: [10, 298.5, 69, 314.5],
      quantity: [10, 370.5, 69, 386.5],
      unitX: 70.8, // 「日」「食」の位置（2列目の「食」は原本に印字がないので書き足す）
      numberFill: [0.8, 1, 0.8],
    },

    // 臨時食品調理販売届における確認事項（「主催団体確認欄」の□の左上）
    kakunin: {
      boxes: {
        supervisor: [85.1, 151.5], cooking_only: [85.1, 167.4], packaged_licensed: [85.1, 199.4],
        water_tap: [85.1, 231.3], water_other: [84.1, 247.2],
        handwash_tank: [85.1, 279.2], handwash_sink: [84.1, 311.1],
        alcohol: [85.1, 343.0], no_prep: [85.1, 358.8], simple_cook: [85.1, 374.8],
        temperature: [85.1, 406.7], clothes: [85.1, 422.7], sick: [85.1, 438.6],
        eat_soon: [85.1, 454.6], inform: [85.1, 470.6], report: [85.1, 486.5], meibo: [85.1, 518.4],
      },
      supervisorName: [317, 149.5, 399, 164],
      date: { year: [82, 584, 126.5, 598.5], month: [138, 584, 158.5, 598.5], day: [169.5, 584, 190, 598.5] },
      orgName: [334, 583, 523, 596],
      representative: [334, 607, 523, 620],
      checker: [366, 631, 523, 644],
    },

    // 調理従事者名簿及び調理方法（A4横）。記入例の下の空欄に書く
    meibo: {
      cols: { item: [52.6, 157.6], name: [157.6, 252.1], address: [252.1, 399.1], tel: [399.1, 504.1], age: [504.1, 535.7], role: [535.7, 787.7] },
      top: 210.5, bottom: 528.5, line: 15,
    },
  };

  const BOX = 10.5;
  const FONT_PT = 10.5;

  // ---------------------------------------------------------------- 文字組み

  const HANG = "、。，．）」』】〕！？：；ー";

  function wrap(font, text, size, width) {
    const lines = [];
    for (const para of String(text).split(/\r?\n/)) {
      let line = "";
      for (const ch of para) {
        const next = line + ch;
        if (line && font.widthOfTextAtSize(next, size) > width && !HANG.includes(ch)) {
          lines.push(line);
          line = ch;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  function makeWriter(PDFLib, font) {
    const black = PDFLib.rgb(0, 0, 0);

    // rect = [x0, y0, x1, y1]（左上原点）の中に text を書く。はみ出す場合は縮小し、縦位置も揃える
    function put(page, rect, text, opts = {}) {
      if (text == null || String(text).trim() === "") return;
      const { align = "left", valign = "middle", minScale = 0.45 } = opts;
      const size0 = opts.size || FONT_PT;
      const [x0, y0, x1, y1] = rect;
      const w = x1 - x0, h = y1 - y0;
      let size = size0, lines;
      for (; ; size -= 0.25) {
        lines = wrap(font, text, size, w);
        if (lines.length * size * 1.25 <= h + 0.5 || size <= size0 * minScale) break;
      }
      const lh = size * 1.25;
      const used = lines.length * lh;
      let top = y0;
      if (used < h) top += valign === "middle" ? (h - used) / 2 : valign === "bottom" ? h - used : 0;
      const H = page.getHeight();
      lines.forEach((ln, i) => {
        const tw = font.widthOfTextAtSize(ln, size);
        const x = align === "center" ? x0 + (w - tw) / 2 : align === "right" ? x1 - tw : x0;
        const baseline = top + i * lh + (lh - size) / 2 + size * 0.86;
        page.drawText(ln, { x, y: H - baseline, size, font, color: black });
      });
    }

    // □（左上 x, y）の中にチェック印。フォントに頼らず線で描く
    function tick(page, x, y) {
      const H = page.getHeight();
      const p = [[x + BOX * 0.18, y + BOX * 0.52], [x + BOX * 0.42, y + BOX * 0.8], [x + BOX * 0.88, y + BOX * 0.12]];
      for (let i = 0; i < 2; i++)
        page.drawLine({ start: { x: p[i][0], y: H - p[i][1] }, end: { x: p[i + 1][0], y: H - p[i + 1][1] }, thickness: 1.3, color: black });
    }

    function oval(page, [x0, y0, x1, y1]) {
      const H = page.getHeight();
      page.drawEllipse({ x: (x0 + x1) / 2, y: H - (y0 + y1) / 2, xScale: (x1 - x0) / 2, yScale: (y1 - y0) / 2, borderColor: black, borderWidth: 0.8 });
    }

    function hline(page, x0, x1, y, thickness = 0.5) {
      const H = page.getHeight();
      page.drawLine({ start: { x: x0, y: H - y }, end: { x: x1, y: H - y }, thickness, color: black });
    }

    function fillRect(page, [x0, y0, x1, y1], c) {
      const H = page.getHeight();
      page.drawRectangle({ x: x0, y: H - y1, width: x1 - x0, height: y1 - y0, color: PDFLib.rgb(c[0], c[1], c[2]) });
    }

    return { put, tick, oval, hline, fillRect, font, rgb: PDFLib.rgb };
  }

  // ---------------------------------------------------------------- 各書類

  const str = (v) => (v == null ? "" : String(v));

  async function addTodoke(out, src, data, W, wareki) {
    const L = LAYOUT.todoke, S = LAYOUT.shop;
    const org = data.organizer || {}, ev = data.event || {}, shops = data.shops || [];
    const nPages = Math.max(1, Math.ceil(shops.length / 2));
    const idx = [0];
    for (let i = 0; i < nPages; i++) idx.push(S.templatePages[Math.min(i, S.templatePages.length - 1)]);
    const pages = await out.copyPages(src, idx);
    pages.forEach((p) => out.addPage(p));

    const p = pages[0];
    const d = wareki.parse(data.submit_date);
    if (d) {
      W.put(p, L.date.year, wareki.reiwaYear(d), { align: "right" });
      W.put(p, L.date.month, String(d.m), { align: "center" });
      W.put(p, L.date.day, String(d.d), { align: "center" });
    }
    for (const k of Object.keys(L.organizer)) W.put(p, L.organizer[k], str(org[k]));
    let period = wareki.period(wareki.parse(ev.start_date), wareki.parse(ev.end_date));
    if (str(ev.time).trim()) period += "\n" + str(ev.time).trim();
    W.put(p, L.period, period);
    W.put(p, L.eventName, str(ev.name));
    W.put(p, L.place, str(ev.place));

    // 原本にない5ページ目以降（出店者7件目～）は番号を塗り直す
    for (let i = S.templatePages.length; i < nPages; i++) {
      S.cols.forEach(([x0, x1], c) => {
        const r = [x0 + 0.6, S.rows.number[0] + 0.7, x1 - 0.6, S.rows.number[1] - 0.3];
        W.fillRect(pages[1 + i], r, S.numberFill);
        W.put(pages[1 + i], r, wareki.zen(i * 2 + c + 1), { align: "center" });
      });
    }

    shops.forEach((s, i) => {
      const pg = pages[1 + Math.floor(i / 2)];
      const col = i % 2;
      const [x0, x1] = S.cols[col];
      const cell = (key, text, size) => W.put(pg, [x0 + 3, S.rows[key][0] + 2, x1 - 3, S.rows[key][1] - 2], text, { size });
      const rel = ([a, b, c, e]) => [x0 + a, b, x0 + c, e];

      cell("name", [s.name, s.address, s.tel].map((x) => str(x).trim()).filter(Boolean).join("\n"));
      if (s.has_permit) {
        W.tick(pg, x0 + S.boxX, S.permitYes);
        if (str(s.permit_type).trim()) W.put(pg, [x0 + 3, S.permitType[0], x1 - 3, S.permitType[1]], `業種：${str(s.permit_type).trim()}`, { size: 10 });
      } else W.tick(pg, x0 + S.boxX, S.permitNo);
      if (s.other_events) {
        W.tick(pg, x0 + S.boxX, S.otherYes);
        W.put(pg, rel(S.otherCount), str(s.other_count), { align: "center" });
      } else W.tick(pg, x0 + S.boxX, S.otherNo);
      W.put(pg, rel(S.days), str(s.future_days).trim() || "0", { align: "right" });
      cell("foods", str(s.foods));
      const qty = str(s.quantity).trim();
      if (qty) {
        W.put(pg, rel(S.quantity), qty, { align: "right" });
        if (col === 1) W.put(pg, [x0 + S.unitX, S.quantity[1], x0 + S.unitX + 20, S.quantity[3]], "食");
      }
      for (const k of ["prep_facility", "transport", "prep_process", "prep_storage", "onsite_process", "onsite_storage"])
        cell(k, str(s[k]), 10);
    });
  }

  async function addKakunin(out, src, data, W, wareki) {
    const K = LAYOUT.kakunin;
    const org = data.organizer || {}, ev = data.event || {};
    const checks = { ...(data.checks || {}) };
    // 水・手洗いは選んだ方の行にだけチェック
    if (checks.water) checks[ev.water === "other" ? "water_other" : "water_tap"] = true;
    if (checks.handwash) checks[ev.handwash === "sink" ? "handwash_sink" : "handwash_tank"] = true;

    const [p] = await out.copyPages(src, [0]);
    out.addPage(p);
    for (const [k, [x, y]] of Object.entries(K.boxes)) if (checks[k]) W.tick(p, x, y);
    W.put(p, K.supervisorName, str(org.supervisor), { align: "center" });
    const d = wareki.parse(data.submit_date);
    if (d) {
      W.put(p, K.date.year, wareki.reiwaYear(d), { align: "right", size: 10 });
      W.put(p, K.date.month, String(d.m), { align: "center" });
      W.put(p, K.date.day, String(d.d), { align: "center" });
    }
    W.put(p, K.orgName, str(org.name));
    W.put(p, K.representative, str(org.representative));
    W.put(p, K.checker, str(org.checker));
  }

  function meiboBlocks(shops, font) {
    const M = LAYOUT.meibo;
    const width = (k, pad) => M.cols[k][1] - M.cols[k][0] - pad;
    const lines = (t, k, pad) => (t ? wrap(font, t, 10, width(k, pad)).length : 1);
    const blocks = [];
    for (const s of shops) {
      const staff = (s.staff || []).filter((p) => str(p.name).trim());
      if (!staff.length) continue;
      let role = str(s.meibo_role).trim();
      if (!role) {
        role = [
          str(s.prep_process).trim() && `（下処理）${str(s.prep_process).trim()}`,
          str(s.onsite_process).trim() && `（現地）${str(s.onsite_process).trim()}`,
        ].filter(Boolean).join("\n");
      }
      const n = Math.max(staff.length, lines(role, "role", 8), lines(str(s.foods), "item", 6));
      blocks.push({ item: str(s.foods), staff, role, height: n * M.line + 6 });
    }
    return blocks;
  }

  async function addMeibo(out, src, data, W) {
    const M = LAYOUT.meibo;
    const blocks = meiboBlocks(data.shops || [], W.font);
    let page = null, y = M.bottom + 1;
    for (const b of blocks) {
      const h = Math.min(b.height, M.bottom - M.top);
      if (y + h > M.bottom) {
        [page] = await out.copyPages(src, [0]);
        out.addPage(page);
        y = M.top;
      }
      const c = M.cols;
      W.put(page, [c.item[0] + 3, y + 2, c.item[1] - 3, y + h - 2], b.item, { size: 10 });
      W.put(page, [c.role[0] + 4, y + 2, c.role[1] - 4, y + h - 2], b.role, { size: 10 });
      const line = Math.min(M.line, (h - 6) / b.staff.length);
      const size = Math.min(10, line * 0.68);
      b.staff.forEach((person, j) => {
        const ly = y + 3 + j * line;
        for (const k of ["name", "address", "tel", "age"])
          W.put(page, [c[k][0] + 5, ly, c[k][1] - 3, ly + line], str(person[k]), { size, align: k === "age" ? "center" : "left", minScale: 0.3 });
        if (person.leader) {
          const tw = W.font.widthOfTextAtSize(str(person.name), size);
          W.oval(page, [c.name[0] + 1.5, ly + 0.5, c.name[0] + 9 + tw, ly + line - 0.5]);
        }
      });
      y += h;
      W.hline(page, c.item[0], c.role[1], y);
    }
  }

  function dataUrlBytes(url) {
    const b64 = String(url).split(",").pop();
    if (typeof atob === "function") return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  async function addMaps(out, data, images, W) {
    const venue = images && images.venue;
    const booths = ((images && images.booths) || []).filter((b) => b.png);
    if (!venue && !booths.length) return;
    const ev = data.event || {};
    const [PW, PH] = [841.89, 595.28];
    const m = 36;
    const draw = async (page, png, [x0, y0, x1, y1]) => {
      const img = await out.embedPng(dataUrlBytes(png));
      const s = Math.min((x1 - x0) / img.width, (y1 - y0) / img.height);
      const w = img.width * s, h = img.height * s;
      page.drawImage(img, { x: x0 + (x1 - x0 - w) / 2, y: PH - y0 - h, width: w, height: h });
    };
    if (venue) {
      const p = out.addPage([PW, PH]);
      W.put(p, [m, 24, PW - m, 46], "催事全体がわかる平面図（全ての出店店舗の配置が分かるもの）", { size: 14, valign: "top" });
      W.put(p, [m, 48, PW - m, 64], `開催名称：${str(ev.name)}　　開催場所：${str(ev.place)}`, { size: 10, valign: "top" });
      await draw(p, venue, [m, 70, PW - m, PH - m]);
    }
    for (let i = 0; i < booths.length; i += 2) {
      const p = out.addPage([PW, PH]);
      W.put(p, [m, 24, PW - m, 46], "各ブースレイアウト図", { size: 14, valign: "top" });
      const cw = (PW - m * 2 - 20) / 2;
      for (const [j, b] of booths.slice(i, i + 2).entries()) {
        const x = m + j * (cw + 20);
        W.put(p, [x, 56, x + cw, 74], str(b.label), { size: 11, valign: "top" });
        p.drawRectangle({ x, y: m, width: cw, height: PH - 78 - m, borderColor: W.rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
        await draw(p, b.png, [x + 4, 82, x + cw - 4, PH - m - 4]);
      }
    }
  }

  // 提出書類一式を1つのPDFにする。順番：届 → ②平面図・ブース図 → ④確認事項 → ⑤調理従事者名簿（作る場合）
  // deps = { PDFLib, fontkit, wareki, load: async (path) => Uint8Array }
  async function build(data, images, deps) {
    const { PDFLib, fontkit, wareki, load } = deps;
    const F = LAYOUT.files;
    const [todoke, kakunin, meibo, fontBytes] = await Promise.all([load(F.todoke), load(F.kakunin), load(F.meibo), load(F.font)]);
    const out = await PDFLib.PDFDocument.create();
    out.registerFontkit(fontkit);
    const font = await out.embedFont(fontBytes, { subset: true });
    const W = makeWriter(PDFLib, font);
    await addTodoke(out, await PDFLib.PDFDocument.load(todoke), data, W, wareki);
    await addMaps(out, data, images, W);
    await addKakunin(out, await PDFLib.PDFDocument.load(kakunin), data, W, wareki);
    if (data.include_meibo) await addMeibo(out, await PDFLib.PDFDocument.load(meibo), data, W);
    out.setTitle("臨時食品調理販売届");
    out.setCreator("臨時食品調理販売届メーカー");
    return out.save();
  }

  return { build, LAYOUT, wrap };
});
