// 查詢結果的內容（卡片／清單／查無），由掃描頁的底部面板載入
import { formatExpiry, formatText, type FindResult, type Product } from "../db";
import { state } from "../state";
import { el } from "../ui";

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
    { class: "card product-card" },
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
    { class: p.d ? "disabled" : "", role: "button", tabindex: "0" },
    el("div", {}, p.n.trim(), p.d ? el("span", { class: "badge" }, "已停用") : null),
    el("div", { class: "sub" }, `編號 ${p.c.trim()}　儲位 ${formatText(p.l)}　庫存 ${(p.q ?? 0).toLocaleString()}`),
  );
  li.addEventListener("click", () => onPick(p));
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(p);
    }
  });
  return li;
}

/** 把查詢結果渲染進容器，回傳面板標題 */
export function renderResultContent(container: HTMLElement, result: FindResult, query: string): string {
  const showCard = (p: Product) => {
    state.selected = p;
    container.replaceChildren(productCard(p));
    if (result.items.length > 1) {
      container.append(el("button", { type: "button", class: "secondary", onclick: () => showList() }, "返回清單"));
    }
    container.scrollTop = 0;
  };
  const showList = () => {
    state.selected = null;
    const hint =
      result.kind === "exact"
        ? el("p", { class: "muted" }, "此條碼對應多個商品，請選擇")
        : el("p", { class: "muted" }, `名稱包含「${query}」的商品（最多 50 筆）`);
    container.replaceChildren(hint, el("ul", { class: "list" }, ...result.items.map((p) => listItem(p, showCard))));
  };

  if (result.kind === "none") {
    container.replaceChildren(
      el("div", { class: "card center" }, el("p", {}, "找不到這個條碼或商品"), el("p", { class: "muted" }, "可改用商品編號或名稱關鍵字查詢；若為新商品，請先到「資料」頁同步。")),
    );
    return `查無「${query}」`;
  }
  if (result.items.length === 1) {
    showCard(result.items[0]);
    return "查詢結果";
  }
  if (state.selected && result.items.includes(state.selected)) showCard(state.selected);
  else showList();
  return `${result.items.length} 筆相符`;
}
