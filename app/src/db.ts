// 商品資料層：記憶體索引 + IndexedDB 持久化。查詢邏輯為純函式，方便測試。
import { get, set, del } from "idb-keyval";

/** 伺服器 get_scan_products() 回傳的商品欄位（縮寫以縮小體積） */
export interface Product {
  c: string;            // 商品編號
  n: string;            // 商品名稱
  u: string | null;     // 單位
  b: string | null;     // 國際條碼
  b2: string | null;    // 國際條碼 2
  b3: string | null;    // 國際條碼 3
  pb: string | null;    // 店內碼
  l: string | null;     // 儲位（HQ）
  q: number | null;     // 現有庫存（HQ）
  e: string | null;     // 效期（民國年文字）
  e2: string | null;    // 效期 2
  d: boolean;           // 已停用
}

export interface DataVersion {
  synced_at: string;    // ISO 時間，product_data 最近成功同步
  row_count: number;
  status?: string;
}

export interface ProductBundle {
  version: DataVersion;
  products: Product[];
  downloadedAt: string; // 手機下載時間（ISO）
}

export type FindResult =
  | { kind: "exact"; items: Product[] }     // 條碼或商品編號完全相符（可能多筆）
  | { kind: "search"; items: Product[] }    // 名稱關鍵字搜尋
  | { kind: "none"; items: Product[] };

export const SEARCH_LIMIT = 50;

const clean = (v: string | null | undefined): string => (v ?? "").trim();

/** 掃到的條碼可能與資料庫寫法差一個前導 0（UPC-A 12 碼 vs EAN-13） */
export function barcodeVariants(input: string): string[] {
  const s = clean(input);
  if (!s) return [];
  const out = new Set<string>([s]);
  if (/^\d+$/.test(s)) {
    if (s.length === 12) out.add("0" + s);
    if (s.length === 13 && s.startsWith("0")) out.add(s.slice(1));
    if (s.length === 7) out.add("0" + s); // EAN-8 少讀一碼的保險
  }
  return [...out];
}

export class ProductIndex {
  readonly all: Product[];
  private byBarcode = new Map<string, Product[]>();
  private byCode = new Map<string, Product>();

  constructor(products: Product[]) {
    this.all = products;
    for (const p of products) {
      this.byCode.set(clean(p.c), p);
      for (const code of [p.b, p.b2, p.b3, p.pb]) {
        const k = clean(code);
        if (!k) continue;
        const list = this.byBarcode.get(k);
        if (list) {
          if (!list.includes(p)) list.push(p);
        } else {
          this.byBarcode.set(k, [p]);
        }
      }
    }
  }

  get size(): number {
    return this.all.length;
  }

  findByBarcode(input: string): Product[] {
    const found: Product[] = [];
    for (const v of barcodeVariants(input)) {
      for (const p of this.byBarcode.get(v) ?? []) if (!found.includes(p)) found.push(p);
    }
    return found;
  }

  findByCode(input: string): Product | undefined {
    return this.byCode.get(clean(input));
  }

  searchByName(keyword: string, limit = SEARCH_LIMIT): Product[] {
    const words = clean(keyword).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out: Product[] = [];
    for (const p of this.all) {
      const name = p.n.toLowerCase();
      if (words.every((w) => name.includes(w))) {
        out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** 掃描或手動輸入共用：先條碼，再商品編號，最後名稱關鍵字 */
  find(input: string): FindResult {
    const s = clean(input);
    if (!s) return { kind: "none", items: [] };
    const byBarcode = this.findByBarcode(s);
    if (byBarcode.length) return { kind: "exact", items: byBarcode };
    const byCode = this.findByCode(s);
    if (byCode) return { kind: "exact", items: [byCode] };
    const searched = this.searchByName(s);
    return searched.length ? { kind: "search", items: searched } : { kind: "none", items: [] };
  }
}

// ---- 顯示用格式化 ----

/** 效期：民國年文字原樣顯示；空白／底線為「—」；999 開頭為「免效期」 */
export function formatExpiry(v: string | null | undefined): string {
  const s = clean(v);
  if (!s || /^[_\s/]*$/.test(s)) return "—";
  if (s.startsWith("999")) return "免效期";
  return s;
}

export function formatText(v: string | null | undefined): string {
  const s = clean(v);
  return s || "—";
}

/** 版本比較：伺服器同步時間比本機新 → 需要更新 */
export function needsUpdate(local: DataVersion | null, remote: DataVersion | null): boolean {
  if (!remote?.synced_at) return false;
  if (!local?.synced_at) return true;
  return new Date(remote.synced_at).getTime() > new Date(local.synced_at).getTime();
}

// ---- IndexedDB 持久化 ----
const KEY_BUNDLE = "product_bundle";

export async function loadBundle(): Promise<ProductBundle | null> {
  try {
    return (await get<ProductBundle>(KEY_BUNDLE)) ?? null;
  } catch {
    return null;
  }
}

export async function saveBundle(bundle: ProductBundle): Promise<void> {
  await set(KEY_BUNDLE, bundle);
}

export async function clearBundle(): Promise<void> {
  try {
    await del(KEY_BUNDLE);
  } catch {
    /* 清不掉也不影響登出 */
  }
}
