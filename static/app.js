"use strict";

const STORAGE_KEY = "hokenjo-rinji-v1";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- 状態

function blankShop() {
  return {
    id: uid(), name: "", address: "", tel: "", has_permit: false, permit_type: "",
    other_events: false, other_count: "", future_days: "0", foods: "", quantity: "",
    prep_facility: "", transport: "", prep_process: "", prep_storage: "",
    onsite_process: "", onsite_storage: "", staff: [],
  };
}

function blankState() {
  return {
    version: 1,
    submit_date: today(),
    include_meibo: false,
    organizer: { name: "", representative: "", address: "", contact: "", supervisor: "", checker: "" },
    event: { name: "", place: "", start_date: "", end_date: "", time: "", water: "tap", handwash: "tank", has_flyer: false },
    checks: {},
    shops: [blankShop()],
    maps: { venue: [], booths: {} },
  };
}

let state = load() || blankState();
let checkItems = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return s && s.version ? normalize(s) : null;
  } catch { return null; }
}

function normalize(s) {
  const base = blankState();
  const out = { ...base, ...s };
  out.organizer = { ...base.organizer, ...(s.organizer || {}) };
  out.event = { ...base.event, ...(s.event || {}) };
  out.maps = { venue: [], booths: {}, ...(s.maps || {}) };
  out.shops = (s.shops || []).map((sh) => ({ ...blankShop(), ...sh, id: sh.id || uid() }));
  out.checks = s.checks || {};
  return out;
}

let saveTimer;
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 保存できなくても動作は続ける */ }
  }, 300);
  scheduleCheck();
}

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}

// ---------------------------------------------------------------- 共通フォーム

function bindStatic() {
  for (const el of $$("[data-bind]")) {
    const path = el.dataset.bind;
    const handler = () => {
      let v;
      if (el.type === "checkbox") v = el.checked;
      else if (el.type === "radio") { if (!el.checked) return; v = el.value; }
      else v = el.value;
      setPath(state, path, v);
      if (path === "include_meibo") renderDocList();
      if (path.startsWith("event.water") || path.startsWith("event.handwash")) renderChecks();
      changed();
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  }
}

function fillStatic() {
  for (const el of $$("[data-bind]")) {
    const v = getPath(state, el.dataset.bind);
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.type === "radio") el.checked = el.value === v;
    else el.value = v ?? "";
  }
}

// ---------------------------------------------------------------- 出店者

const PRESETS = {
  "焼きそば": {
    prep_facility: "○○公民館 調理室",
    transport: "保冷剤入りクーラーボックスで当日搬入",
    prep_process: "開催当日○時～ 下処理施設で野菜・肉を切る（仕入れ先：○○）",
    prep_storage: "冷蔵庫（10℃以下）で保管",
    onsite_process: "鉄板で肉・野菜・麺を十分に加熱して炒め、ソースで味付けして提供（麺の仕入れ先：○○）",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で10℃以下を確認",
  },
  "フランクフルト": {
    prep_process: "下処理なし（串付きの市販冷凍フランクフルトを使用、仕入れ先：○○）",
    prep_storage: "冷凍のまま保管",
    onsite_process: "鉄板で中心部まで十分に加熱して提供",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で温度を確認",
  },
  "焼き鳥": {
    prep_process: "下処理なし（串打ち済みの市販品を使用、仕入れ先：○○）",
    prep_storage: "冷凍・冷蔵のまま保管",
    onsite_process: "炭火で中心部まで十分に加熱して提供",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で10℃以下を確認",
  },
  "たこ焼き": {
    prep_facility: "○○公民館 調理室",
    transport: "保冷剤入りクーラーボックスで当日搬入",
    prep_process: "開催当日○時～ 下処理施設で生地を作り、ゆでだこ・ねぎを切る（仕入れ先：○○）",
    prep_storage: "冷蔵庫（10℃以下）で保管",
    onsite_process: "たこ焼き器で中まで十分に加熱して提供",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で10℃以下を確認",
  },
  "唐揚げ": {
    prep_facility: "○○公民館 調理室",
    transport: "保冷剤入りクーラーボックスで当日搬入",
    prep_process: "開催当日○時～ 下処理施設で鶏肉を切り、下味をつける（仕入れ先：○○）",
    prep_storage: "冷蔵庫（10℃以下）で保管",
    onsite_process: "油で中心部まで十分に揚げて提供",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で10℃以下を確認",
  },
  "豚汁": {
    prep_facility: "○○公民館 調理室",
    transport: "保冷剤入りクーラーボックスで当日搬入",
    prep_process: "開催当日○時～ 下処理施設で野菜・豚肉を切る（仕入れ先：○○）",
    prep_storage: "冷蔵庫（10℃以下）で保管",
    onsite_process: "鍋で十分に煮込み、提供まで加熱を続ける",
    onsite_storage: "クーラーボックス＋保冷剤、温度計で10℃以下を確認",
  },
  "かき氷": {
    prep_process: "下処理なし（市販の氷・市販のシロップを使用、仕入れ先：○○）",
    prep_storage: "氷はクーラーボックスで保管",
    onsite_process: "市販の氷を削り、市販のシロップをかけて提供",
    onsite_storage: "氷はクーラーボックスで保管、シロップは表示どおり保管",
  },
  "ジュース（注ぎ分け）": {
    prep_process: "下処理なし（市販の清涼飲料水を使用、仕入れ先：○○）",
    prep_storage: "表示の保存方法に従って保管",
    onsite_process: "市販の清涼飲料水を使い捨てコップに注ぎ分けて提供",
    onsite_storage: "クーラーボックスで冷やして保管",
  },
  "包装済みの市販品": {
    prep_process: "下処理なし（許可施設で製造・包装・表示された市販品をそのまま販売、仕入れ先：○○）",
    prep_storage: "表示の保存方法に従って保管",
    onsite_process: "開封・加工せずにそのまま販売",
    onsite_storage: "表示の保存方法に従って保管",
  },
};

function shopLabel(s, i) {
  const food = (s.foods || "").replace(/[（(][^）)]*[）)]?/g, "").split(/[、,，・\s]/).filter(Boolean)[0] || "";
  return `${i + 1}. ${food || s.name || "出店者"}`;
}

function renderShops() {
  const list = $("#shop-list");
  list.innerHTML = "";
  const tpl = $("#shop-template");
  state.shops.forEach((s, i) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.id = `shop-${i}`;
    node.dataset.index = i;
    $("[data-no]", node).textContent = `${i + 1}.`;
    const title = $("[data-title]", node);
    title.textContent = s.name || "（名前未入力）";

    for (const el of $$("[data-f]", node)) {
      const f = el.dataset.f;
      if (el.type === "radio") {
        el.name = `${f}-${s.id}`;
        el.checked = String(!!s[f]) === el.value;
      } else el.value = s[f] ?? "";
      const handler = () => {
        if (el.type === "radio") { if (!el.checked) return; s[f] = el.value === "true"; }
        else s[f] = el.value;
        if (f === "name") title.textContent = s.name || "（名前未入力）";
        if (f === "has_permit" || f === "other_events") toggleShop(node, s);
        if (f === "name" || f === "foods") refreshBoothSelect();
        changed();
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
    toggleShop(node, s);

    const preset = $("[data-preset]", node);
    for (const k of Object.keys(PRESETS)) preset.add(new Option(k, k));
    preset.addEventListener("change", () => {
      const p = PRESETS[preset.value];
      if (!p) return;
      const filled = Object.keys(p).some((k) => (s[k] || "").trim());
      if (filled && !confirm("入力済みの調理工程の欄を例文で上書きしますか？")) { preset.value = ""; return; }
      Object.assign(s, Object.fromEntries(Object.keys(PRESETS[Object.keys(PRESETS)[0]]).map((k) => [k, ""])), p);
      if (!s.foods) s.foods = preset.value.replace(/（.*）/, "");
      preset.value = "";
      renderShops();
      changed();
    });

    renderStaff(node, s);
    node.addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (!act) return;
      if (act === "del") {
        if (!confirm(`「${s.name || "この出店者"}」を削除しますか？`)) return;
        state.shops.splice(i, 1);
        delete state.maps.booths[s.id];
      } else if (act === "dup") {
        const c = JSON.parse(JSON.stringify(s));
        c.id = uid();
        state.shops.splice(i + 1, 0, c);
      } else if (act === "up" && i > 0) {
        [state.shops[i - 1], state.shops[i]] = [state.shops[i], state.shops[i - 1]];
      } else if (act === "down" && i < state.shops.length - 1) {
        [state.shops[i + 1], state.shops[i]] = [state.shops[i], state.shops[i + 1]];
      } else if (act === "add-staff") {
        s.staff.push({ name: "", address: "", tel: "", age: "", leader: s.staff.length === 0 });
        renderStaff(node, s);
        $("details", node).open = true;
        changed();
        return;
      } else return;
      renderShops();
      refreshBoothSelect();
      changed();
    });
    list.appendChild(node);
  });
}

function toggleShop(node, s) {
  $$("[data-show]", node).forEach((el) => { el.hidden = !s[el.dataset.show]; });
  $("[data-detail]", node).classList.toggle("optional", !!s.has_permit);
}

function renderStaff(node, s) {
  const body = $("[data-staff]", node);
  body.innerHTML = "";
  $("[data-staff-count]", node).textContent = s.staff.length ? `（${s.staff.length}人）` : "";
  s.staff.forEach((p, j) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="c"><input type="radio" name="leader-${s.id}" ${p.leader ? "checked" : ""} title="調理責任者"></td>
      <td><input data-k="name" value=""></td><td><input data-k="address"></td>
      <td><input data-k="tel" inputmode="tel"></td><td><input data-k="age" type="number" class="num"></td>
      <td><button type="button" class="danger small" title="削除">×</button></td>`;
    for (const inp of $$("[data-k]", tr)) {
      inp.value = p[inp.dataset.k] ?? "";
      inp.addEventListener("input", () => { p[inp.dataset.k] = inp.value; changed(); });
    }
    $("input[type=radio]", tr).addEventListener("change", () => {
      s.staff.forEach((q) => { q.leader = q === p; });
      changed();
    });
    $("button", tr).addEventListener("click", () => { s.staff.splice(j, 1); renderStaff(node, s); changed(); });
    body.appendChild(tr);
  });
}

// ---------------------------------------------------------------- 確認事項

function renderChecks() {
  const box = $("#check-list");
  box.innerHTML = "";
  for (const item of checkItems) {
    let label = item.label;
    if (item.key === "water") label = state.event.water === "other"
      ? "使用水は水道水以外。滅菌済みを確認し、水質検査成績書を添付する" : "使用水は水道水である";
    if (item.key === "handwash") label = state.event.handwash === "sink"
      ? "水道・シンク等があり、液体石けんを用意して手洗いを励行する"
      : "40L以上のコック付きポリタンクと液体石けんを用意して手洗いを励行する";
    const el = document.createElement("label");
    el.className = "check";
    el.innerHTML = `<input type="checkbox"><span></span>`;
    el.querySelector("span").textContent = label;
    const cb = el.querySelector("input");
    cb.checked = !!state.checks[item.key];
    cb.addEventListener("change", () => { state.checks[item.key] = cb.checked; changed(); });
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------- 図面

let venueEditor, boothEditor;
let boothShopId = null;

function initMaps() {
  venueEditor = new MapEditor($("#venue-editor"), {
    palette: VENUE_PALETTE, width: 960, height: 640,
    onChange: () => { state.maps.venue = venueEditor.getItems(); changed(); },
  });
  venueEditor.setItems(state.maps.venue);

  boothEditor = new MapEditor($("#booth-editor"), {
    palette: BOOTH_PALETTE, width: 600, height: 480,
    onChange: () => {
      if (boothShopId) state.maps.booths[boothShopId] = boothEditor.getItems();
      changed();
    },
  });
  $("#booth-shop").addEventListener("change", (e) => selectBooth(e.target.value));
  refreshBoothSelect();

  $("#btn-place-booths").addEventListener("click", placeBooths);
  $("#btn-booth-standard").addEventListener("click", () => {
    if (!boothShopId) return;
    if (boothEditor.hasContent() && !confirm("今の図を消して標準レイアウトを置きますか？")) return;
    boothEditor.setItems([]);
    for (const [type, x, y, w, h] of BOOTH_STANDARD) boothEditor.add(type, { x, y, w, h });
    boothEditor.select(null);
  });
  $("#btn-booth-copy").addEventListener("click", () => {
    const others = state.shops.filter((s) => s.id !== boothShopId && (state.maps.booths[s.id] || []).length);
    if (!others.length) { alert("図を描いた出店者がまだいません"); return; }
    const names = others.map((s, i) => `${i + 1}: ${s.name || s.foods}`).join("\n");
    const n = Number(prompt(`どの出店者の図をコピーしますか？番号を入力\n${names}`));
    const src = others[n - 1];
    if (!src) return;
    boothEditor.setItems(JSON.parse(JSON.stringify(state.maps.booths[src.id])));
    state.maps.booths[boothShopId] = boothEditor.getItems();
    changed();
  });
}

function refreshBoothSelect() {
  const sel = $("#booth-shop");
  if (!sel) return;
  sel.innerHTML = "";
  state.shops.forEach((s, i) => {
    const drawn = (state.maps.booths[s.id] || []).length ? "（作成済み）" : "";
    sel.add(new Option(`${shopLabel(s, i)}　${s.name || ""}${drawn}`, s.id));
  });
  if (!state.shops.some((s) => s.id === boothShopId)) boothShopId = state.shops[0]?.id || null;
  sel.value = boothShopId || "";
  selectBooth(boothShopId, true);
}

function selectBooth(id, quiet) {
  boothShopId = id;
  if (boothEditor) boothEditor.setItems(id ? state.maps.booths[id] || [] : []);
  if (!quiet) refreshBoothSelect();
}

function placeBooths() {
  const items = venueEditor.getItems();
  const existing = new Map(items.filter((i) => i.shopId).map((i) => [i.shopId, i]));
  let col = 0, row = 0;
  const w = 110, h = 64, gap = 10, perRow = 7;
  state.shops.forEach((s, i) => {
    const label = `${shopLabel(s, i)}\n${s.name || ""}`;
    const it = existing.get(s.id);
    if (it) { it.label = label; return; }
    while (true) {
      const x = 40 + col * (w + gap), y = 40 + row * (h + 60);
      col++; if (col >= perRow) { col = 0; row++; }
      const hit = items.some((o) => o.type !== "area" && x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
      if (!hit || row > 8) {
        items.push({ id: `m${uid()}`, type: "booth", shopId: s.id, label, x, y, w, h });
        break;
      }
    }
  });
  // 削除された出店者のブースは消す
  const ids = new Set(state.shops.map((s) => s.id));
  venueEditor.setItems(items.filter((i) => !i.shopId || ids.has(i.shopId)));
  state.maps.venue = venueEditor.getItems();
  changed();
}

async function mapImages() {
  const images = { venue: null, booths: [] };
  if (venueEditor.hasContent()) images.venue = await venueEditor.toPNG(2);
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-9999px;width:600px";
  document.body.appendChild(holder);
  try {
    for (const [i, s] of state.shops.entries()) {
      const items = state.maps.booths[s.id] || [];
      if (!items.length) continue;
      const ed = new MapEditor(holder, { palette: BOOTH_PALETTE, width: 600, height: 480 });
      ed.setItems(items);
      images.booths.push({ label: `${shopLabel(s, i)}（${s.name || ""}）`, png: await ed.toPNG(2) });
    }
  } finally { holder.remove(); }
  return images;
}

// ---------------------------------------------------------------- チェック

let checkTimer;
function scheduleCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(runCheck, 500);
}

async function runCheck() {
  let list = [];
  try {
    const r = await fetch("/api/check", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: state }),
    });
    list = await r.json();
  } catch {
    list = [{ level: "warn", message: "サーバーに接続できません。アプリ（python app.py）が起動しているか確認してください", where: "" }];
  }
  if (!state.maps.venue.length)
    list.push({ level: "info", message: "会場の平面図が未作成です。5. で作るか、別に用意して添付してください", where: "maps" });
  const noBooth = state.shops.filter((s) => !(state.maps.booths[s.id] || []).length).length;
  if (noBooth)
    list.push({ level: "info", message: `ブースレイアウト図が未作成の出店者が${noBooth}件あります`, where: "maps" });
  renderWarnings(list);
}

function renderWarnings(list) {
  const box = $("#warnings");
  box.innerHTML = "";
  if (!list.length) { box.innerHTML = '<p class="ok">問題は見つかりませんでした。</p>'; return; }
  const order = { error: 0, warn: 1, info: 2 };
  const label = { error: "要修正", warn: "注意", info: "メモ" };
  list.sort((a, b) => order[a.level] - order[b.level]);
  for (const w of list) {
    const el = document.createElement(w.where ? "a" : "div");
    el.className = `warning ${w.level}`;
    if (w.where) el.href = `#${w.where}`;
    el.innerHTML = `<b></b><span></span>`;
    el.querySelector("b").textContent = label[w.level];
    el.querySelector("span").textContent = w.message;
    box.appendChild(el);
  }
}

// ---------------------------------------------------------------- 出力

function renderDocList() {
  const docs = [
    "臨時食品調理販売届（出店者は2件ずつ1ページ）",
    "② 催事全体の平面図・各ブースレイアウト図（作成した場合）",
    "④ 臨時食品調理販売届における確認事項",
  ];
  if (state.include_meibo) docs.push("⑤ 調理従事者名簿及び調理方法");
  $("#doc-list").innerHTML = docs.map((d) => `<li>${d}</li>`).join("") +
    `<li class="muted">別途：${state.event.water === "other" ? "① 水質検査成績書、" : ""}${state.event.has_flyer ? "③ イベントのチラシ" : "（チラシがあれば③として添付）"}</li>`;
}

async function generate(preview) {
  const btns = $$("#btn-preview, #btn-download");
  btns.forEach((b) => (b.disabled = true));
  const win = preview ? window.open("", "_blank") : null;
  try {
    const images = await mapImages();
    const r = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: state, images, inline: preview }),
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else {
      const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("Content-Disposition") || "");
      const a = Object.assign(document.createElement("a"), {
        href: url, download: m ? decodeURIComponent(m[1]) : "臨時食品調理販売届.pdf",
      });
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (win) win.close();
    alert("PDFを作れませんでした：" + e.message);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// ---------------------------------------------------------------- 保存・読み込み

function saveFile() {
  const name = (state.event.name || "臨時届").replace(/[\\/:*?"<>|\s]+/g, "_");
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob), download: `${name}_${state.event.start_date || today()}.json`,
  });
  document.body.appendChild(a); a.click(); a.remove();
}

function openFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = normalize(JSON.parse(reader.result));
      const keep = confirm("読み込みました。\nイベント日付と提出日をリセットして「次回用」にしますか？\n（OK＝日付をリセット／キャンセル＝そのまま開く）");
      if (keep) {
        s.submit_date = today();
        s.event.start_date = ""; s.event.end_date = "";
      }
      state = s;
      renderAll();
      changed();
    } catch (e) { alert("ファイルを読み込めませんでした：" + e.message); }
  };
  reader.readAsText(file);
}

function renderAll() {
  fillStatic();
  renderShops();
  renderChecks();
  renderDocList();
  if (venueEditor) venueEditor.setItems(state.maps.venue);
  refreshBoothSelect();
}

// ---------------------------------------------------------------- 起動

async function init() {
  try {
    checkItems = await (await fetch("/api/check-items")).json();
  } catch { checkItems = []; }
  // 未設定の確認事項は最初からオン（保存データに明示的な false があればそれを優先）
  for (const it of checkItems) if (!(it.key in state.checks)) state.checks[it.key] = true;

  bindStatic();
  initMaps();
  renderAll();

  $("#btn-add-shop").addEventListener("click", () => {
    state.shops.push(blankShop());
    renderShops(); refreshBoothSelect(); changed();
    $(`#shop-${state.shops.length - 1}`).scrollIntoView({ behavior: "smooth" });
  });
  $("#btn-check-all").addEventListener("click", () => {
    for (const it of checkItems) state.checks[it.key] = true;
    renderChecks(); changed();
  });
  $("[data-copy-contact]").addEventListener("click", () => {
    const who = (state.organizer.contact || "").split(/[\s　]+[0-9０-９(（]/)[0].trim();
    if (!who) { alert("先に担当者氏名を入力してください"); return; }
    state.organizer.supervisor = who; state.organizer.checker = who;
    fillStatic(); changed();
  });
  $("#btn-preview").addEventListener("click", () => generate(true));
  $("#btn-download").addEventListener("click", () => generate(false));
  $("#btn-save").addEventListener("click", saveFile);
  $("#btn-load").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });
  $("#btn-new").addEventListener("click", () => {
    if (!confirm("入力内容を消して新しく作りますか？（必要なら先に「データを保存」してください）")) return;
    state = blankState();
    for (const it of checkItems) state.checks[it.key] = true;
    renderAll(); changed();
  });

  // 表示中のセクションをナビで強調
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting)
      $$("#steps a").forEach((a) => a.classList.toggle("active", a.dataset.step === e.target.id));
  }, { rootMargin: "-40% 0px -55% 0px" });
  $$("[data-section]").forEach((s) => obs.observe(s));

  scheduleCheck();
}

init();
