// 全 APP 共用狀態（單純物件，不做複雜的狀態管理）
import type { DataVersion, FindResult, Product, ProductBundle } from "./db";
import { ProductIndex } from "./db";
import type { AppUser } from "./supabase";

export interface AppState {
  user: AppUser | null;
  bundle: ProductBundle | null;
  index: ProductIndex | null;
  remoteVersion: DataVersion | null;
  updateAvailable: boolean;
  lastQuery: string;
  lastResult: FindResult | null;
  selected: Product | null;
}

export const state: AppState = {
  user: null,
  bundle: null,
  index: null,
  remoteVersion: null,
  updateAvailable: false,
  lastQuery: "",
  lastResult: null,
  selected: null,
};

export function setBundle(bundle: ProductBundle | null): void {
  state.bundle = bundle;
  state.index = bundle ? new ProductIndex(bundle.products) : null;
}

export function resetState(): void {
  state.user = null;
  setBundle(null);
  state.remoteVersion = null;
  state.updateAvailable = false;
  state.lastQuery = "";
  state.lastResult = null;
  state.selected = null;
}
