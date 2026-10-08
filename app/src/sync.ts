// 商品資料同步：版本比對與下載
import { saveBundle, type DataVersion, type Product, type ProductBundle } from "./db";
import { supabase } from "./supabase";

export type SyncErrorKind = "inactive" | "network" | "other";

export class SyncError extends Error {
  constructor(public kind: SyncErrorKind, message: string) {
    super(message);
  }
}

function classify(error: { code?: string; message?: string } | null): SyncError {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42501" || /inactive|not authenticated/i.test(msg)) {
    return new SyncError("inactive", "帳號已停用或登入已失效，請重新登入");
  }
  if (/fetch|network|Failed to fetch/i.test(msg)) return new SyncError("network", "無法連線到伺服器");
  return new SyncError("other", msg || "同步失敗");
}

export async function fetchRemoteVersion(): Promise<DataVersion> {
  const { data, error } = await supabase.rpc("get_data_version");
  if (error) throw classify(error);
  return data as DataVersion;
}

export async function downloadProducts(): Promise<ProductBundle> {
  const { data, error } = await supabase.rpc("get_scan_products");
  if (error) throw classify(error);
  const payload = data as { version: DataVersion; products: Product[] };
  const bundle: ProductBundle = {
    version: payload.version,
    products: payload.products ?? [],
    downloadedAt: new Date().toISOString(),
  };
  await saveBundle(bundle);
  return bundle;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
