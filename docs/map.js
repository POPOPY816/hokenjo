// 簡易図面エディタ（会場の平面図・ブースレイアウト図用）
// ボタンで部品を追加 → ドラッグで移動、右下の■で大きさ変更、ダブルクリックで名前変更。
"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

const VENUE_PALETTE = [
  { type: "booth", label: "出店ブース", w: 100, h: 60, fill: "#fff3c4" },
  { type: "entrance", label: "入口", w: 60, h: 30, fill: "#dbeafe", bold: true },
  { type: "handwash", label: "手洗い場（液体石けん）", w: 120, h: 40, fill: "#d6f5e3" },
  { type: "eating", label: "飲食スペース（椅子・テーブル）", w: 200, h: 100, fill: "#fde7ef" },
  { type: "stage", label: "舞台", w: 160, h: 80, fill: "#ede7f6" },
  { type: "hq", label: "本部・総合案内", w: 100, h: 60, fill: "#e5e7eb" },
  { type: "toilet", label: "トイレ", w: 60, h: 60, fill: "#e0f7fa" },
  { type: "trash", label: "ゴミ置き場", w: 80, h: 40, fill: "#efebe9" },
  { type: "road", label: "通路", w: 300, h: 30, fill: "#f5f5f5", dashed: true },
  { type: "area", label: "会場の範囲", w: 600, h: 400, fill: "none", dashed: true, back: true },
  { type: "block", label: "建物・区画", w: 120, h: 80, fill: "#eceee9" },
  { type: "text", label: "メモ", w: 120, h: 30, fill: "none", noBorder: true },
];

const BOOTH_PALETTE = [
  { type: "tent", label: "テント（3面を覆う）", w: 440, h: 320, fill: "none", dashed: true, back: true },
  { type: "heat", label: "加熱機器（鉄板・コンロ）", w: 140, h: 70, fill: "#ffcdd2" },
  { type: "worktable", label: "調理台", w: 120, h: 60, fill: "#fff3c4" },
  { type: "handwash", label: "手洗い（40Lポリタンク・液体石けん）", w: 150, h: 60, fill: "#d6f5e3" },
  { type: "alcohol", label: "消毒用アルコール", w: 100, h: 40, fill: "#e1f5fe" },
  { type: "cooler", label: "クーラーボックス・温度計", w: 120, h: 60, fill: "#bbdefb" },
  { type: "counter", label: "商品陳列台＆会計", w: 220, h: 50, fill: "#f0f4c3" },
  { type: "storage", label: "容器・割り箸等の資材置き場", w: 150, h: 50, fill: "#efebe9" },
  { type: "trash", label: "ゴミ箱（蓋付き）", w: 80, h: 50, fill: "#e5e7eb" },
  { type: "customer", label: "お客さん側（入口）", w: 220, h: 30, fill: "#dbeafe", bold: true },
  { type: "block", label: "台・区画", w: 120, h: 60, fill: "#eceee9" },
  { type: "area", label: "範囲", w: 200, h: 120, fill: "none", dashed: true, back: true },
  { type: "text", label: "メモ", w: 120, h: 30, fill: "none", noBorder: true },
];

// ブースの「標準レイアウト」（記入例を参考にした配置）
const BOOTH_STANDARD = [
  ["tent", 40, 30, 520, 370],
  ["handwash", 60, 70, 150, 60],
  ["storage", 230, 70, 150, 50],
  ["cooler", 420, 70, 120, 60],
  ["alcohol", 60, 140, 100, 40],
  ["worktable", 60, 220, 120, 60],
  ["heat", 280, 200, 160, 70],
  ["trash", 460, 300, 80, 50],
  ["counter", 150, 330, 260, 50],
  ["customer", 150, 420, 260, 30],
];

let _uid = 0;
const newId = () => `m${Date.now().toString(36)}${(_uid++).toString(36)}`;

class MapEditor {
  constructor(root, { palette, width = 960, height = 640, grid = 10, onChange = () => {} }) {
    this.root = root;
    this.palette = palette;
    this.width = width;
    this.height = height;
    this.grid = grid;
    this.onChange = onChange;
    this.items = [];
    this.selected = null;
    this.build();
  }

  spec(type) {
    return this.palette.find((p) => p.type === type) || { fill: "#fff" };
  }

  build() {
    this.root.innerHTML = "";
    this.root.classList.add("map-editor");

    const bar = document.createElement("div");
    bar.className = "map-palette";
    for (const p of this.palette) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.innerHTML = `<span class="swatch" style="background:${p.fill === "none" ? "transparent" : p.fill};${p.dashed ? "border-style:dashed" : ""}"></span>${p.label}`;
      b.addEventListener("click", () => this.add(p.type));
      bar.appendChild(b);
    }
    this.root.appendChild(bar);

    const tools = document.createElement("div");
    tools.className = "map-tools";
    tools.innerHTML = `
      <span class="map-hint">選択中：<b data-sel>なし</b></span>
      <button type="button" data-act="rename">名前を変える</button>
      <button type="button" data-act="rotate">縦横を入れ替え</button>
      <button type="button" data-act="dup">複製</button>
      <button type="button" data-act="del" class="danger">削除</button>
      <button type="button" data-act="clear" class="ghost">全部消す</button>`;
    tools.addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act) this.action(act);
    });
    this.root.appendChild(tools);
    this.selLabel = tools.querySelector("[data-sel]");

    const wrap = document.createElement("div");
    wrap.className = "map-canvas";
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute("tabindex", "0");
    this.svg.innerHTML = `
      <defs><pattern id="grid-${this.width}" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="#e5e7eb" stroke-width="1"/></pattern></defs>
      <rect class="bg" x="0" y="0" width="${this.width}" height="${this.height}" fill="#fff"/>
      <rect class="grid" x="0" y="0" width="${this.width}" height="${this.height}" fill="url(#grid-${this.width})"/>
      <g class="items"></g>`;
    this.layer = this.svg.querySelector(".items");
    wrap.appendChild(this.svg);
    this.root.appendChild(wrap);

    this.svg.addEventListener("pointerdown", (e) => this.onDown(e));
    this.svg.addEventListener("dblclick", (e) => {
      const g = e.target.closest("[data-id]");
      if (g) { this.select(g.dataset.id); this.action("rename"); }
    });
    this.svg.addEventListener("keydown", (e) => {
      if (!this.selected) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); this.action("del"); }
      const step = e.shiftKey ? 1 : this.grid;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (mv) {
        e.preventDefault();
        const it = this.get(this.selected);
        it.x = this.clampX(it.x + mv[0], it.w);
        it.y = this.clampY(it.y + mv[1], it.h);
        this.render(); this.onChange();
      }
    });
  }

  get(id) { return this.items.find((i) => i.id === id); }
  clampX(x, w) { return Math.max(0, Math.min(this.width - w, x)); }
  clampY(y, h) { return Math.max(0, Math.min(this.height - h, y)); }
  snap(v) { return Math.round(v / this.grid) * this.grid; }

  setItems(items) {
    this.items = (items || []).map((i) => ({ ...i }));
    this.selected = null;
    this.render();
  }

  getItems() { return this.items.map((i) => ({ ...i })); }

  add(type, extra = {}) {
    const s = this.spec(type);
    const w = extra.w || s.w, h = extra.h || s.h;
    const pos = extra.x !== undefined ? {} : this.freeSpot(w, h, s.back);
    const it = { id: newId(), type, label: s.label, w, h, ...pos, ...extra };
    if (s.back) this.items.unshift(it); else this.items.push(it);
    this.select(it.id);
    this.onChange();
    return it;
  }

  // 他の部品と重ならない場所を左上から探す
  freeSpot(w, h, back) {
    if (back) return { x: this.clampX(20, w), y: this.clampY(20, h) };
    const solid = this.items.filter((i) => !this.spec(i.type).back);
    for (let y = 20; y + h <= this.height; y += 20) {
      for (let x = 20; x + w <= this.width; x += 20) {
        const hit = solid.some((o) => x < o.x + o.w + 10 && x + w + 10 > o.x && y < o.y + o.h + 10 && y + h + 10 > o.y);
        if (!hit) return { x, y };
      }
    }
    return { x: this.clampX(40, w), y: this.clampY(40, h) };
  }

  async action(act) {
    if (act === "clear") {
      if (this.items.length && await UI.confirm("この図面の部品を全部消しますか？", { ok: "全部消す", danger: true })) {
        this.items = []; this.select(null); this.onChange();
      }
      return;
    }
    const it = this.get(this.selected);
    if (!it) { await UI.notify("先に図面の部品をクリックして選んでください"); return; }
    if (act === "del") {
      this.items = this.items.filter((i) => i !== it);
      this.select(null);
    } else if (act === "rename") {
      const v = await UI.prompt("表示する名前（改行して2行にもできます）", it.label, { multiline: true });
      if (v === null) return;
      it.label = v;
    } else if (act === "rotate") {
      [it.w, it.h] = [it.h, it.w];
      it.x = this.clampX(it.x, it.w); it.y = this.clampY(it.y, it.h);
    } else if (act === "dup") {
      const c = { ...it, id: newId(), x: this.clampX(it.x + 20, it.w), y: this.clampY(it.y + 20, it.h) };
      this.items.push(c); this.selected = c.id;
    }
    this.render(); this.onChange();
  }

  select(id) {
    this.selected = id;
    const it = id && this.get(id);
    this.selLabel.textContent = it ? it.label.replace(/\n/g, " ") : "なし";
    this.render();
  }

  toLocal(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  onDown(e) {
    const g = e.target.closest("[data-id]");
    if (!g) { this.select(null); return; }
    e.preventDefault();
    this.svg.focus({ preventScroll: true });
    const it = this.get(g.dataset.id);
    if (this.selected !== it.id) this.select(it.id);
    const start = this.toLocal(e);
    const orig = { ...it };
    const resize = e.target.classList.contains("handle");
    let moved = false;
    const move = (ev) => {
      const p = this.toLocal(ev);
      const dx = p.x - start.x, dy = p.y - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (resize) {
        it.w = Math.max(20, Math.min(this.width - it.x, this.snap(orig.w + dx)));
        it.h = Math.max(20, Math.min(this.height - it.y, this.snap(orig.h + dy)));
      } else {
        it.x = this.clampX(this.snap(orig.x + dx), it.w);
        it.y = this.clampY(this.snap(orig.y + dy), it.h);
      }
      this.render();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) this.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // 箱の大きさに合わせて文字を折り返す
  layoutText(label, w, h) {
    const raw = String(label || "").split("\n");
    for (let size = 14; size >= 8; size--) {
      const per = Math.max(1, Math.floor((w - 8) / size));
      const lines = raw.flatMap((l) => (l ? l.match(new RegExp(`.{1,${per}}`, "g")) : [""]));
      if (lines.length * size * 1.2 <= h - 4 || size === 8) return { size, lines };
    }
  }

  render(forExport = false) {
    const parts = [];
    for (const it of this.items) {
      const s = this.spec(it.type);
      const sel = !forExport && it.id === this.selected;
      const stroke = s.noBorder ? (sel ? "#2563eb" : "none") : sel ? "#2563eb" : "#111";
      const dash = s.dashed || (s.noBorder && sel) ? ' stroke-dasharray="8 5"' : "";
      const { size, lines } = this.layoutText(it.label, it.w, it.h);
      const top = it.y + it.h / 2 - ((lines.length - 1) * size * 1.2) / 2;
      // テントや会場範囲は左上にラベル
      const corner = s.back;
      const tspans = lines.map((l, i) =>
        `<tspan x="${corner ? it.x + 8 : it.x + it.w / 2}" y="${corner ? it.y + 18 + i * size * 1.2 : top + i * size * 1.2}">${escapeXml(l)}</tspan>`).join("");
      parts.push(`<g data-id="${it.id}" class="item${sel ? " sel" : ""}">
        <rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="3" fill="${s.fill === "none" ? "rgba(255,255,255,0.01)" : s.fill}"
          stroke="${stroke}" stroke-width="${sel ? 2.5 : 1.5}"${dash}/>
        <text text-anchor="${corner ? "start" : "middle"}" dominant-baseline="central" font-size="${size}"
          font-weight="${s.bold ? 700 : 400}" fill="#111">${tspans}</text>
        ${sel ? `<rect class="handle" x="${it.x + it.w - 9}" y="${it.y + it.h - 9}" width="14" height="14" fill="#2563eb"/>` : ""}
      </g>`);
    }
    if (forExport) return parts.join("");
    this.layer.innerHTML = parts.join("");
  }

  hasContent() { return this.items.length > 0; }

  // 図面をPNG（data URL）にする
  toPNG(scale = 2) {
    const svg = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${this.width} ${this.height}" width="${this.width * scale}" height="${this.height * scale}"
      font-family="'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo','Noto Sans JP','IPAGothic',sans-serif">
      <rect width="100%" height="100%" fill="#fff"/>${this.render(true)}</svg>`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = this.width * scale; c.height = this.height * scale;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

window.MapEditor = MapEditor;
window.VENUE_PALETTE = VENUE_PALETTE;
window.BOOTH_PALETTE = BOOTH_PALETTE;
window.BOOTH_STANDARD = BOOTH_STANDARD;
