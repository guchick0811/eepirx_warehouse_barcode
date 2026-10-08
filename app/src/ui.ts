// 極簡 DOM 工具：所有資料一律以 textContent 寫入，不使用 innerHTML 放資料。
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | number | ((e: Event) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "class") {
      node.className = String(v);
    } else if (v === true) {
      node.setAttribute(k, "");
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer: number | null = null;
export function toast(message: string, kind: "info" | "error" | "ok" = "info"): void {
  let box = document.getElementById("toast");
  if (!box) {
    box = el("div", { id: "toast", role: "status" });
    document.body.append(box);
  }
  box.textContent = message;
  box.className = `toast toast-${kind} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box?.classList.remove("show"), 2600);
}

export function navigate(hash: string): void {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = hash;
  }
}

export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}
