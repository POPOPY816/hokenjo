// 画面内ダイアログ（alert / confirm / prompt の代わり。埋め込み表示でも動くようにページ内で描く）
(function () {
  "use strict";

  function open({ title, message, input, buttons }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "ui-dialog";
      const form = document.createElement("form");
      form.method = "dialog";
      if (title) {
        const h = document.createElement("h2");
        h.textContent = title;
        form.appendChild(h);
      }
      if (message) {
        const p = document.createElement("p");
        p.textContent = message;
        form.appendChild(p);
      }
      let field = null;
      if (input) {
        field = document.createElement(input.multiline ? "textarea" : "input");
        field.id = "ui-dialog-input";
        field.value = input.value || "";
        if (input.multiline) field.rows = 3;
        if (input.placeholder) field.placeholder = input.placeholder;
        if (!input.multiline)
          field.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); dlg.close("ok"); }
          });
        form.appendChild(field);
      }
      const row = document.createElement("div");
      row.className = "ui-dialog-actions";
      for (const b of buttons) {
        const btn = document.createElement("button");
        btn.type = "submit";
        btn.value = b.value;
        btn.textContent = b.label;
        btn.className = b.className || "";
        row.appendChild(btn);
      }
      form.appendChild(row);
      dlg.appendChild(form);
      document.body.appendChild(dlg);
      dlg.addEventListener("close", () => {
        const v = dlg.returnValue;
        dlg.remove();
        resolve({ value: v, text: field ? field.value : null });
      });
      dlg.showModal();
      (field || row.lastElementChild).focus();
    });
  }

  const UI = {
    async notify(message, title) {
      await open({ title, message, buttons: [{ label: "OK", value: "ok", className: "primary" }] });
    },
    async confirm(message, { ok = "OK", cancel = "キャンセル", danger = false, title } = {}) {
      const r = await open({
        title, message,
        buttons: [{ label: cancel, value: "cancel", className: "ghost" }, { label: ok, value: "ok", className: danger ? "danger-solid" : "primary" }],
      });
      return r.value === "ok";
    },
    async choose(message, choices, title) {
      const r = await open({ title, message, buttons: choices });
      return r.value;
    },
    async prompt(message, value = "", opts = {}) {
      const r = await open({
        title: opts.title, message, input: { value, multiline: opts.multiline, placeholder: opts.placeholder },
        buttons: [{ label: "キャンセル", value: "cancel", className: "ghost" }, { label: "OK", value: "ok", className: "primary" }],
      });
      return r.value === "ok" ? r.text : null;
    },
  };

  window.UI = UI;
})();
