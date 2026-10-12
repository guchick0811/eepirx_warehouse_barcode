// 內嵌 SVG 線條圖示（取代 emoji，跨平台外觀一致，顏色跟著 currentColor）
const NS = "http://www.w3.org/2000/svg";

const PATHS: Record<string, string> = {
  camera: "M4 8a2 2 0 0 1 2-2h2l1.2-1.8A1 1 0 0 1 10 3.7h4a1 1 0 0 1 .8.5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z M12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  database: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M3 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7.5 M21 21v-1a6 6 0 0 0-4-5.7",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 2.1 M12 17h.01",
  close: "M6 6l12 12 M18 6L6 18",
  back: "M15 5l-7 7 7 7",
};

export function icon(name: keyof typeof PATHS, size = 24): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  return svg;
}
