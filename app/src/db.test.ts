import { describe, expect, it } from "vitest";
import { ProductIndex, barcodeVariants, formatExpiry, needsUpdate, type Product } from "./db";

const P = (over: Partial<Product>): Product => ({
  c: "0000000", n: "", u: null, b: null, b2: null, b3: null, pb: null, l: null, q: 0, e: null, e2: null, d: false, ...over,
});

const products: Product[] = [
  P({ c: "0000008", n: "[生達]待可服寧膜衣錠 50mgx10錠/盒 Volna-K", b: "4713680327423", pb: "2000000000121", l: "7B0502", q: 2, e: "116/10/31", e2: "115/12/31" }),
  P({ c: "0000001", n: "[Now Sports]L-GLUTAMINE 454g", b: "0898220010608" }),
  P({ c: "0000100", n: "重複條碼商品 A", b: "9300605119222" }),
  P({ c: "0000101", n: "重複條碼商品 B", b2: "9300605119222" }),
  P({ c: "0000102", n: "內部碼商品", b: "AC15091100 " }),
  ...Array.from({ length: 60 }, (_, i) => P({ c: "9" + String(i).padStart(6, "0"), n: "維他命 C 錠 " + i })),
];
const idx = new ProductIndex(products);

describe("barcodeVariants", () => {
  it("12 碼補前導 0，13 碼去前導 0", () => {
    expect(barcodeVariants("898220010608")).toEqual(["898220010608", "0898220010608"]);
    expect(barcodeVariants("0898220010608")).toEqual(["0898220010608", "898220010608"]);
    expect(barcodeVariants(" AC15091100 ")).toEqual(["AC15091100"]);
    expect(barcodeVariants("")).toEqual([]);
  });
});

describe("ProductIndex.find", () => {
  it("EAN-13 完全相符 1 筆", () => {
    const r = idx.find("4713680327423");
    expect(r.kind).toBe("exact");
    expect(r.items.map((p) => p.c)).toEqual(["0000008"]);
  });
  it("UPC-A 12 碼可對到 13 碼前補 0 的資料", () => {
    expect(idx.find("898220010608").items.map((p) => p.c)).toEqual(["0000001"]);
  });
  it("店內碼（private_bar_code）可查到", () => {
    expect(idx.find("2000000000121").items.map((p) => p.c)).toEqual(["0000008"]);
  });
  it("同一條碼對應多商品時回傳多筆", () => {
    const r = idx.find("9300605119222");
    expect(r.kind).toBe("exact");
    expect(r.items.map((p) => p.c).sort()).toEqual(["0000100", "0000101"]);
  });
  it("商品編號完全相符", () => {
    expect(idx.find("0000008").items[0].l).toBe("7B0502");
  });
  it("資料庫條碼含尾端空白仍可比對", () => {
    expect(idx.find("AC15091100").items.map((p) => p.c)).toEqual(["0000102"]);
  });
  it("名稱關鍵字搜尋上限 50 筆，支援多關鍵字", () => {
    const r = idx.find("維他命 錠");
    expect(r.kind).toBe("search");
    expect(r.items.length).toBe(50);
    expect(idx.find("維他命 5").items.every((p) => p.n.includes("5"))).toBe(true);
  });
  it("查無資料", () => {
    expect(idx.find("zzzz不存在").kind).toBe("none");
    expect(idx.find("   ").kind).toBe("none");
  });
});

describe("formatExpiry", () => {
  it("空值與 999 的顯示", () => {
    expect(formatExpiry("___/__/__")).toBe("—");
    expect(formatExpiry("/  /")).toBe("—");
    expect(formatExpiry(null)).toBe("—");
    expect(formatExpiry("999/12/31")).toBe("免效期");
    expect(formatExpiry("116/10/31")).toBe("116/10/31");
  });
});

describe("needsUpdate", () => {
  const v = (t: string) => ({ synced_at: t, row_count: 1 });
  it("本機較舊才需要更新", () => {
    expect(needsUpdate(v("2026-10-07T18:08:46Z"), v("2026-10-08T18:08:46Z"))).toBe(true);
    expect(needsUpdate(v("2026-10-08T18:08:46Z"), v("2026-10-08T18:08:46Z"))).toBe(false);
    expect(needsUpdate(null, v("2026-10-08T18:08:46Z"))).toBe(true);
    expect(needsUpdate(v("2026-10-08T18:08:46Z"), null)).toBe(false);
  });
});
