import { formatExpiry, formatText, type Product } from "../db";
import { state } from "../state";
import { el, navigate } from "../ui";

function field(label: string, value: string, cls = ""): HTMLElement {
  return el("div", { class: cls }, el("dt", {}, label), el("dd", {}, value));
}

function barcodes(p: Product): string {
  const codes = [p.b, p.b2, p.b3].map((c) => (c ?? "").trim()).filter(Boolean);
  return codes.length ? codes.join("、") : "—";
}

export function productCard(p: Product): HTMLElement {
  const qty = p.q ?? 0;
  return el(
    "div",
    { class: "card" },
    el("p", { class: "product-name" }, p.n.trim(), p.d ? el("span", { class: "badge" }, "已停用") : null),
    el(
      "dl",
      { class: "fields" },
      field("儲位（總部倉庫）", formatText(p.l), "big " + (p.l?.trim() ? "ok" : "")),
      field("現有庫存", `${qty.toLocaleString()}${p.u?.trim() ? " " + p.u.trim() : ""}`, "big " + (qty <= 0 ? "zero" : "")),
      field("商品編號", formatText(p.c)),
      field("國際條碼", barcodes(p)),
      field("店內碼", formatText(p.pb)),
      field("效期", formatExpiry(p.e)),
      field("效期2", formatExpiry(p.e2)),
    ),
  );
}

function listItem(p: Product, onPick: (p: Product) => void): HTMLElement {
  const li = el(
    "li",
    { class: p.d ? "disabled" : "" },
    el("div", {}, p.n.trim(), p.d ? el("span", { class: "badge" }, "已停用") : null),
    el("div", { class: "sub" }, `編號 ${p.c.trim()}　儲位 ${formatText(p.l)}　庫存 ${(p.q ?? 0).toLocaleString()}`),
  );
  li.addEventListener("click", () => onPick(p));
  return li;
}

export function renderResult(root: HTMLElement): void {
  const result = state.lastResult;
  if (!result) {
    navigate("#/scan");
    return;
  }
  const back = el("button", { type: "button", onclick: () => navigate("#/scan") }, "📷 繼續掃描");
  const body = el("div", { class: "stack" });

  const showCard = (p: Product) => {
    state.selected = p;
    body.replaceChildren(productCard(p));
    if (result.items.length > 1) {
      body.append(el("button", { type: "button", class: "secondary", onclick: () => showList() }, "返回清單"));
    }
    window.scrollTo(0, 0);
  };
  const showList = () => {
    state.selected = null;
    const title =
      result.kind === "exact"
        ? el("p", {}, "此條碼對應多個商品，請選擇：", el("span", { class: "badge dup" }, `${result.items.length} 筆`))
        : el("p", { class: "muted" }, `名稱包含「${state.lastQuery}」的商品（最多 50 筆）`);
    body.replaceChildren(title, el("ul", { class: "list" }, ...result.items.map((p) => listItem(p, showCard))));
  };

  // 「繼續掃描」固定在畫面底部（導覽列上方），不必捲動就能按
  root.classList.add("has-action");
  root.append(el("h1", {}, "查詢結果"), el("p", { class: "muted" }, `查詢：${state.lastQuery}`), body, el("div", { class: "action-bar" }, back));

  if (result.kind === "none") {
    body.append(el("div", { class: "card center" }, el("p", {}, "找不到這個條碼或商品"), el("p", { class: "muted" }, "可改用商品編號或名稱關鍵字查詢；若為新商品，請先同步資料。")));
  } else if (state.selected) {
    showCard(state.selected);
  } else if (result.items.length === 1) {
    showCard(result.items[0]);
  } else {
    showList();
  }
}
