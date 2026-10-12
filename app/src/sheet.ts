// 底部面板：固定在導覽列上方、可下滑關閉（1:1 跟手、依速度決定收回或關閉）
import { icon } from "./icons";
import { el } from "./ui";

export interface Sheet {
  root: HTMLElement;
  body: HTMLElement;
  readonly isOpen: boolean;
  setTitle(text: string): void;
  open(): void;
  close(): void;
}

const CLOSE_DISTANCE = 120; // 拖超過這個距離就關閉
const CLOSE_VELOCITY = 0.6; // px/ms，快速下滑也關閉

export function createSheet(opts: { label: string; onClose: () => void }): Sheet {
  const title = el("div", { class: "sheet-title" });
  const closeBtn = el("button", { type: "button", class: "sheet-close", "aria-label": "關閉" }, icon("close", 22));
  const grip = el("div", { class: "sheet-grip" }, el("span", { class: "sheet-handle", "aria-hidden": "true" }), title, closeBtn);
  const body = el("div", { class: "sheet-body" });
  const root = el("section", { class: "sheet", role: "dialog", "aria-label": opts.label, "aria-hidden": "true" }, grip, body);

  let open = false;
  let dragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  const setY = (y: number, animate: boolean) => {
    root.style.transition = animate ? "" : "none";
    root.style.transform = y === 0 ? "" : `translateY(${y}px)`;
  };

  const sheet: Sheet = {
    root,
    body,
    get isOpen() {
      return open;
    },
    setTitle(text) {
      title.textContent = text;
    },
    open() {
      open = true;
      root.classList.add("open");
      root.setAttribute("aria-hidden", "false");
      setY(0, true);
      body.scrollTop = 0;
    },
    close() {
      if (!open) return;
      open = false;
      root.classList.remove("open");
      root.setAttribute("aria-hidden", "true");
      setY(0, true);
      opts.onClose();
    },
  };

  closeBtn.addEventListener("click", () => sheet.close());

  // 拖曳：只在握把列上開始，避免與內容捲動衝突
  grip.addEventListener("pointerdown", (e) => {
    if (!open) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const dt = e.timeStamp - lastT || 1;
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    // 往上拉用橡皮筋阻力，往下 1:1 跟手
    const y = dy >= 0 ? dy : (dy * 60) / (60 + Math.abs(dy));
    setY(y, false);
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - startY;
    if (dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) sheet.close();
    else setY(0, true);
  };
  grip.addEventListener("pointerup", endDrag);
  grip.addEventListener("pointercancel", endDrag);

  return sheet;
}
